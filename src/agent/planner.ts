import { z } from "zod";
import * as llm from "./llm";
import { plannerPrompt, plannerSystem } from "./prompts";
import type { Recipe, TaskPlan } from "./types";

/**
 * Turns a one-line objective into a task graph.
 *
 * Every field is required in the schema. Gemini's structured output handles
 * required fields far more reliably than optional ones, and "empty array" is a
 * clearer contract than "key may be absent".
 */
const PlanSchema = z.object({
  restatedGoal: z
    .string()
    .describe("The objective in your own words, including anything implied but unstated"),
  steps: z
    .array(
      z.object({
        id: z.string().describe("Short id such as s1, s2, s3"),
        title: z.string().describe("Imperative one-liner"),
        intent: z.string().describe("Why this step exists and what it contributes"),
        successCriterion: z
          .string()
          .describe("A concrete, observable condition that makes this step done"),
        dependsOn: z.array(z.string()).describe("Ids of steps that must pass first; may be empty"),
      }),
    )
    .min(1)
    .max(10),
  finalVerification: z
    .string()
    .describe("How to confirm the whole objective afterwards, through an independent route"),
  blockingQuestions: z
    .array(z.string())
    .describe("Questions that must be answered before it is safe to start; usually empty"),
});

export async function makePlan(
  goal: string,
  recipes: Recipe[],
  priorAttempt?: string,
): Promise<TaskPlan> {
  const plan = await llm.json({
    schema: PlanSchema,
    system: plannerSystem(),
    prompt: plannerPrompt(goal, recipes, priorAttempt),
    temperature: 0.25,
    label: "planner",
  });

  // Guard against a plan that references step ids it never defines, which
  // would otherwise deadlock the dependency check in the loop.
  const ids = new Set(plan.steps.map((s) => s.id));
  for (const step of plan.steps) {
    step.dependsOn = step.dependsOn.filter((d) => ids.has(d) && d !== step.id);
  }

  return plan;
}
