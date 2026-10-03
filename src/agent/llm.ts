import { FunctionCallingConfigMode, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { config, assertLlmConfigured } from "./config";
import type { ToolDefinition } from "./types";

/**
 * Thin wrapper over the Gemini SDK with the two call shapes the agent needs:
 * a structured-JSON call for planning and judging, and a forced tool call for
 * acting.
 *
 * Everything model-specific is confined to this file. Swapping providers means
 * reimplementing `json` and `act`, not touching the loop.
 */

const globalRef = globalThis as unknown as { __praxisGenAI?: GoogleGenAI };

function client(): GoogleGenAI {
  assertLlmConfigured();
  return (globalRef.__praxisGenAI ??= new GoogleGenAI({ apiKey: config.llm.apiKey }));
}

/**
 * Gemini accepts JSON Schema but rejects a few keywords that Zod emits.
 * Stripping them here is cheaper than hand-maintaining a parallel schema
 * format for every tool.
 */
function sanitise(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitise);
  if (schema === null || typeof schema !== "object") return schema;

  const drop = new Set(["$schema", "$id", "default", "format", "examples", "const"]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (drop.has(k)) continue;
    out[k] = sanitise(v);
  }
  return out;
}

export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const raw = z.toJSONSchema(schema, { io: "input", target: "draft-7" });
  return sanitise(raw) as Record<string, unknown>;
}

/* -------------------------------------------------------------------------- */
/* Tiers and pacing                                                           */
/* -------------------------------------------------------------------------- */

export type Tier = "reasoning" | "action" | "fast";

/**
 * Paces requests to stay inside a per-minute allowance.
 *
 * Without this the agent bursts, collects a 429, and spends its time in
 * backoff instead of working. Spacing requests evenly is both faster overall
 * and far less noisy in the trace, and it means the quota is a known
 * constraint the system is designed around rather than an error it keeps
 * rediscovering.
 */
class RequestPacer {
  private nextSlot = 0;
  private readonly spacingMs: number;

  constructor(rpm: number) {
    this.spacingMs = Math.ceil(60_000 / Math.max(1, rpm));
  }

  async take(): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + this.spacingMs;
    if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
  }

  /** Called on a 429 so every caller of this model waits, not just the failing one. */
  backOff(ms: number): void {
    this.nextSlot = Math.max(this.nextSlot, Date.now() + ms);
  }

  /** How long a caller would wait right now. Used to skip a model that is cooling down. */
  waitMs(): number {
    return Math.max(0, this.nextSlot - Date.now());
  }
}

/** Quotas are per model, so pacing is too. */
const pacers = new Map<string, RequestPacer>();

function rpmOf(model: string): number {
  for (const spec of Object.values(config.llm.tiers)) {
    if (spec.model === model) return spec.rpm;
  }
  return /lite/.test(model) ? 15 : 5;
}

function pacerFor(model: string): RequestPacer {
  let p = pacers.get(model);
  if (!p) {
    p = new RequestPacer(rpmOf(model));
    pacers.set(model, p);
  }
  return p;
}

export function modelFor(tier: Tier): string {
  return config.llm.tiers[tier].model;
}

/** The tier's own model first, then the shared fallbacks, without duplicates. */
function chainFor(tier: Tier): string[] {
  return [...new Set([modelFor(tier), ...config.llm.fallbacks])];
}

const RETRYABLE = /429|5\d\d|quota|exhaust|overload|unavailable|deadline|timeout|fetch failed|high demand/i;
const SWITCH_MODEL =
  /429|503|quota|exhaust|overload|unavailable|high demand|not found|no longer available|did not choose a tool/i;

/** Gemini tells us exactly how long to wait; honouring it beats guessing. */
function serverRetryDelayMs(message: string): number | null {
  const explicit = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(message);
  if (explicit) return Math.ceil(Number(explicit[1]) * 1000) + 500;
  const inline = /retry in (\d+(?:\.\d+)?)s/i.exec(message);
  if (inline) return Math.ceil(Number(inline[1]) * 1000) + 500;
  return null;
}

/**
 * Runs a model call with pacing, retries and model fallback.
 *
 * An overloaded or rate-limited model is the most common failure in this whole
 * system, and it is not the agent's fault. So rather than burning retries on a
 * model that is refusing work, the call moves down the fallback chain, and
 * only waits when every model in the chain is cooling down at once.
 */
async function withRetry<T>(
  label: string,
  tier: Tier,
  fn: (model: string) => Promise<T>,
  rounds = 3,
): Promise<T> {
  const chain = chainFor(tier);
  const errors: string[] = [];

  for (let round = 0; round < rounds; round++) {
    for (const model of chain) {
      const pacer = pacerFor(model);
      // A model told us to wait a while; try the next one instead of queuing.
      if (pacer.waitMs() > 8_000 && model !== chain.at(-1)) continue;

      await pacer.take();
      try {
        return await fn(model);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${model}: ${message.slice(0, 160)}`);
        if (!RETRYABLE.test(message) && !SWITCH_MODEL.test(message)) {
          throw new Error(`${label} failed on ${model}: ${message}`);
        }
        const delay = serverRetryDelayMs(message);
        pacer.backOff(delay ?? 4_000);
        if (!SWITCH_MODEL.test(message)) {
          // Transient but model-agnostic (a timeout): a short pause, same chain.
          await new Promise((r) => setTimeout(r, 1500 * (round + 1)));
        }
      }
    }
    // Every model refused this round. Wait for the soonest one to free up.
    const soonest = Math.min(...chain.map((m) => pacerFor(m).waitMs()), 20_000);
    await new Promise((r) => setTimeout(r, Math.max(2_000, soonest)));
  }

  throw new Error(
    `${label} failed: every model in the fallback chain was unavailable.\n${errors.slice(-4).join("\n")}`,
  );
}

export interface JsonCallOptions<T> {
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  /** Defaults to the reasoning tier: structured calls are the high-stakes ones. */
  tier?: Tier;
  temperature?: number;
  label?: string;
}

/**
 * Structured generation. The schema is enforced server-side by Gemini and then
 * re-validated locally with Zod, because "valid JSON matching a schema" and
 * "semantically usable" are not the same thing, and a malformed plan should
 * surface here rather than three steps later.
 */
export async function json<T>(opts: JsonCallOptions<T>): Promise<T> {
  const label = opts.label ?? "llm.json";
  const tier = opts.tier ?? "reasoning";

  let feedback = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await withRetry(label, tier, async (model) => {
      const res = await client().models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: opts.prompt + feedback }] }],
        config: {
          systemInstruction: opts.system,
          temperature: opts.temperature ?? 0.2,
          responseMimeType: "application/json",
          responseJsonSchema: jsonSchemaOf(opts.schema),
        },
      });
      return res.text ?? "";
    });

    try {
      return opts.schema.parse(JSON.parse(text));
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      if (attempt === 1) {
        throw new Error(`${label} returned unusable JSON: ${detail}\nRaw: ${text.slice(0, 800)}`);
      }
      feedback = `\n\nYour previous reply could not be parsed (${detail}). Reply with valid JSON matching the schema exactly.`;
    }
  }
  throw new Error(`${label}: unreachable`);
}

export async function text(opts: {
  system: string;
  prompt: string;
  tier?: Tier;
  temperature?: number;
}): Promise<string> {
  const tier = opts.tier ?? "fast";
  return withRetry("llm.text", tier, async (model) => {
    const res = await client().models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
      config: { systemInstruction: opts.system, temperature: opts.temperature ?? 0.3 },
    });
    return (res.text ?? "").trim();
  });
}

export interface ChosenAction {
  tool: string;
  args: Record<string, unknown>;
  rationale: string;
}

/**
 * Forces the model to pick exactly one tool call.
 *
 * Every tool's parameter schema is augmented with a required `rationale`
 * string. That buys the model's reasoning for the chosen action in the same
 * round-trip as the action itself: one request instead of two, and the trace
 * records why each action was taken, which is what makes a failed run
 * debuggable after the fact.
 */
export async function act(opts: {
  system: string;
  prompt: string;
  tools: ToolDefinition[];
  /** Defaults to the action tier, which is where most of the traffic goes. */
  tier?: Tier;
  temperature?: number;
}): Promise<ChosenAction> {
  const declarations = opts.tools.map((t) => {
    const params = (t.rawJsonSchema ? sanitise(t.rawJsonSchema) : jsonSchemaOf(t.parameters)) as {
      type?: string;
      properties?: Record<string, unknown>;
      required?: string[];
    };
    const properties = { ...(params.properties ?? {}) };
    properties.rationale = {
      type: "string",
      description:
        "One sentence on why this action is the right next move, referencing what you just observed.",
    };
    return {
      name: t.name,
      description: `[risk: ${t.risk}] ${t.description}`,
      parametersJsonSchema: {
        type: "object",
        properties,
        required: [...(params.required ?? []), "rationale"],
      },
    };
  });

  const tier = opts.tier ?? "action";
  return withRetry("llm.act", tier, async (model) => {
    const res = await client().models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
      config: {
        systemInstruction: opts.system,
        temperature: opts.temperature ?? 0.15,
        tools: [{ functionDeclarations: declarations }],
        // ANY forces the model to pick a tool rather than replying with prose,
        // which removes a whole class of "the agent explained instead of
        // acting" failures.
        toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } },
      },
    });

    const call = res.functionCalls?.[0];
    if (!call?.name) {
      throw new Error(
        `Model did not choose a tool. It replied: ${(res.text ?? "<empty>").slice(0, 400)}`,
      );
    }

    const args = { ...((call.args ?? {}) as Record<string, unknown>) };
    const rationale = typeof args.rationale === "string" ? args.rationale : "";
    delete args.rationale;

    return { tool: call.name, args, rationale };
  });
}
