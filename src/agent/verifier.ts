import { z } from "zod";
import * as llm from "./llm";
import { evidencePrompt, evidenceSystem, verifierPrompt, verifierSystem } from "./prompts";
import type { ToolRegistry } from "./tools";
import type { MemoryFact, StepRecord, ToolContext, ToolDefinition, Verdict } from "./types";

/**
 * Verification, in two phases.
 *
 * Phase one gathers evidence by going and looking at the systems again, through
 * a small read-only agent loop of its own. Phase two judges the objective
 * against that evidence.
 *
 * The reason for the separate loop rather than a fixed set of database queries
 * is generalisation. A hardcoded check ("read bill X from the ERP API") only
 * verifies the one task it was written for. Letting the verifier decide what to
 * look at means a task about files, or vendors, or a reconciliation, is
 * verified by the same code — and because the verifier holds no state from the
 * run that did the work, what it finds is genuinely independent.
 */

const EVIDENCE_COMPLETE = "evidence_complete";

/** Tools the verifier may use. Reading only, by name, so a future write tool
 *  cannot silently become available to it. */
const READ_ONLY_TOOLS = new Set([
  "browser_open",
  "browser_read",
  "browser_scroll",
  "browser_click",
  "read_pdf",
  "read_file",
  "http_request",
]);

const evidenceComplete: ToolDefinition<{ findings: string }> = {
  name: EVIDENCE_COMPLETE,
  description:
    "Finish gathering evidence and report what you actually found in the systems, including " +
    "exact values and anything missing or inconsistent.",
  risk: "safe",
  parameters: z.object({ findings: z.string().min(1) }),
  async run({ findings }) {
    return { ok: true, observation: findings, data: { findings } };
  },
};

export async function gatherEvidence(input: {
  goal: string;
  finalVerification: string;
  facts: MemoryFact[];
  registry: ToolRegistry;
  ctx: ToolContext;
  maxActions?: number;
}): Promise<string> {
  const maxActions = input.maxActions ?? 7;

  const tools = [
    ...input.registry.list().filter((t) => READ_ONLY_TOOLS.has(t.name)),
    evidenceComplete,
  ];

  const history: string[] = [];
  let latestObservation: string | null = null;

  for (let i = 0; i < maxActions; i++) {
    const chosen = await llm.act({
      system: evidenceSystem(),
      prompt: evidencePrompt({
        goal: input.goal,
        finalVerification: input.finalVerification,
        facts: input.facts,
        history,
        latestObservation,
        actionsRemaining: maxActions - i,
      }),
      tools,
      temperature: 0.1,
    });

    if (chosen.tool === EVIDENCE_COMPLETE) {
      const findings = String(chosen.args.findings ?? "").trim();
      return [
        findings,
        history.length > 0 ? `\nChecks performed:\n${history.join("\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }

    // The verifier is read-only even if the model reaches for a write.
    if (chosen.tool === "http_request" && String(chosen.args.method ?? "GET") !== "GET") {
      latestObservation =
        "Refused: the verifier may only issue GET requests. Use a read instead.";
      history.push(`- attempted a non-GET request and was refused`);
      continue;
    }

    input.ctx.emit({
      type: "thought",
      message: `Verifying: ${chosen.rationale || chosen.tool}`,
      data: { phase: "verification", tool: chosen.tool, args: chosen.args },
    });

    const result = await input.registry.execute(chosen.tool, chosen.args, input.ctx);
    latestObservation = result.observation;
    history.push(
      `- ${chosen.tool}(${JSON.stringify(chosen.args)}) → ${result.ok ? "ok" : "FAILED"}: ` +
        `${result.observation.replace(/\s+/g, " ").slice(0, 180)}`,
    );
  }

  return [
    `The evidence check used all ${maxActions} of its actions without concluding, so the ` +
      `evidence below is incomplete.`,
    history.join("\n"),
    latestObservation ? `Last thing seen:\n${latestObservation.slice(0, 1500)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

const VerdictSchema = z.object({
  achieved: z.boolean().describe("True only if every requirement of the objective is confirmed"),
  confidence: z.enum(["high", "medium", "low"]),
  checks: z
    .array(
      z.object({
        description: z.string().describe("The requirement being checked"),
        passed: z.boolean(),
        evidence: z.string().describe("What in the evidence settles it"),
      }),
    )
    .min(1),
  summary: z.string().describe("The short paragraph the user will read"),
});

export async function verify(input: {
  goal: string;
  restatedGoal: string;
  steps: StepRecord[];
  facts: MemoryFact[];
  finalVerification: string;
  evidence: string;
  notes: string[];
}): Promise<Verdict> {
  const raw = await llm.json({
    schema: VerdictSchema,
    system: verifierSystem(),
    prompt: verifierPrompt(input),
    temperature: 0.1,
    label: "verifier",
  });

  return {
    achieved: raw.achieved,
    confidence: raw.confidence,
    checks: raw.checks,
    summary: raw.summary.trim(),
  };
}
