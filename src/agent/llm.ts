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

const RETRYABLE = /429|5\d\d|quota|exhaust|overload|unavailable|deadline|timeout|fetch failed/i;

async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      if (!RETRYABLE.test(message) || i === attempts - 1) break;
      // Rate limits on the free tier are common enough that backing off here,
      // rather than failing the run, is the difference between a demo that
      // works and one that does not.
      const waitMs = 1200 * 2 ** i + Math.random() * 400;
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${label} failed after ${attempts} attempt(s): ${message}`);
}

export interface JsonCallOptions<T> {
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  /** Use the cheap model for mechanical work like summarising an observation. */
  fast?: boolean;
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
  const model = opts.fast ? config.llm.fastModel : config.llm.model;

  let feedback = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await withRetry(label, async () => {
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
  fast?: boolean;
  temperature?: number;
}): Promise<string> {
  const model = opts.fast ? config.llm.fastModel : config.llm.model;
  return withRetry("llm.text", async () => {
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

  return withRetry("llm.act", async () => {
    const res = await client().models.generateContent({
      model: config.llm.model,
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
