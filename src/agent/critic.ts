import { z } from "zod";
import * as llm from "./llm";
import { criticPrompt, criticSystem } from "./prompts";
import type { Critique, MemoryFact, StepRecord } from "./types";

/**
 * Per-step judgement, run as a separate model call from the one that chose the
 * actions.
 *
 * Keeping these apart matters. The actor has spent several turns trying to make
 * something work and is primed to believe it did; asking it to grade itself in
 * the same context produces optimism. The critic sees only the step's
 * criterion and the transcript, with no stake in the attempt, and it is the
 * component that turns "the agent clicked save" into "the record exists".
 */
const CritiqueSchema = z.object({
  outcome: z.enum(["pass", "retry", "replan", "escalate"]),
  reasoning: z.string().describe("Why you reached this verdict"),
  evidence: z
    .string()
    .describe("The specific observation from the transcript that justifies it, quoted or closely paraphrased"),
  facts: z
    .array(
      z.object({
        key: z.string().describe("snake_case identifier"),
        value: z.string(),
        source: z.string(),
      }),
    )
    .describe("Durable facts the transcript revealed; may be empty"),
  nextActionHint: z
    .string()
    .describe("If the outcome is retry or replan, what to do differently. Otherwise an empty string."),
});

export async function critique(input: {
  goal: string;
  step: StepRecord;
  attempt: number;
  maxAttempts: number;
  transcript: string;
  facts: MemoryFact[];
  claimed: boolean;
}): Promise<Critique> {
  const raw = await llm.json({
    schema: CritiqueSchema,
    system: criticSystem(),
    prompt: criticPrompt(input),
    temperature: 0.1,
    label: "critic",
  });

  return {
    outcome: raw.outcome,
    reasoning: raw.reasoning,
    evidence: raw.evidence,
    facts: raw.facts as MemoryFact[],
    nextActionHint: raw.nextActionHint?.trim() || undefined,
  };
}
