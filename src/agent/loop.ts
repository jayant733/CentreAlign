import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { BrowserSession } from "./browser";
import { config } from "./config";
import { critique } from "./critic";
import { artifacts, events, interventions, memory, recipes, runs, steps } from "./db";
import { DatabaseHumanGateway, readApproval, type HumanGateway } from "./human";
import * as llm from "./llm";
import { makePlan } from "./planner";
import { actorPrompt, actorSystem, recipeSystem } from "./prompts";
import { buildRegistry, FINISH_STEP, REPORT_BLOCKED, type ToolRegistry } from "./tools";
import type {
  Artifact,
  MemoryFact,
  NewEvent,
  StepRecord,
  ToolContext,
  ToolDefinition,
  ToolResult,
} from "./types";
import { gatherEvidence, verify } from "./verifier";
import { z } from "zod";

/**
 * The executor.
 *
 * Shape of a run:
 *
 *   plan  →  for each runnable step { attempt → critique }  →  verify  →  learn
 *
 * An *attempt* is a sequence of single tool calls, each one chosen from the
 * result of the last, ending when the agent claims the step is done, reports
 * itself blocked, or exhausts its action budget. The critic then judges the
 * attempt and returns pass, retry, replan or escalate — so failure handling is
 * a first-class path through the loop rather than a catch block.
 *
 * Nothing in here knows what the task is about. Everything task-specific lives
 * in the plan, and everything environment-specific lives in the tools.
 */

const MAX_ACTIONS_PER_ATTEMPT = 14;
/** Identical failing action this many times in a row ends the attempt. */
const REPEAT_LIMIT = 3;

export interface RunnerOptions {
  human?: HumanGateway;
  /** Extra tools, e.g. discovered over MCP. */
  extraTools?: ToolDefinition[];
  /** Mirrors events as they are written, for CLI output. */
  onEvent?: (e: NewEvent) => void;
}

interface ActionRecord {
  tool: string;
  args: Record<string, unknown>;
  rationale: string;
  result: ToolResult;
}

export async function executeRun(runId: string, options: RunnerOptions = {}): Promise<void> {
  const run = runs.get(runId);
  if (!run) throw new Error(`No run with id ${runId}`);

  const human = options.human ?? new DatabaseHumanGateway();
  const browser = new BrowserSession();
  const registry = buildRegistry(options.extraTools ?? []);

  const emit = (e: NewEvent) => {
    events.append(runId, e);
    options.onEvent?.(e);
  };

  /** Events worth surfacing to the verifier and the final summary. */
  const notes: string[] = [];

  const ctx = makeToolContext({ runId, browser, emit, human });

  try {
    /* ---------------------------------------------------------------- plan */
    runs.setStatus(runId, "planning");
    emit({ type: "run.status", message: "Working out a plan." });

    const scope = new URL(config.baseUrl).host;
    let plan = await makePlan(run.goal, recipes.forScope(scope));

    // Blocking questions are asked before anything is touched, which is the
    // only safe time to ask them.
    if (plan.blockingQuestions.length > 0) {
      const answers: string[] = [];
      for (const question of plan.blockingQuestions.slice(0, 3)) {
        const answer = await human.ask({ runId, kind: "question", prompt: question, emit });
        memory.write(runId, `clarification_${answers.length + 1}`, answer, `user answered: ${question}`);
        answers.push(`Q: ${question}\nA: ${answer}`);
      }
      notes.push(`Asked the user for clarification before starting.\n${answers.join("\n")}`);
      plan = await makePlan(
        run.goal,
        recipes.forScope(scope),
        `Before starting, the user clarified:\n${answers.join("\n")}`,
      );
    }

    runs.setPlan(runId, plan);
    steps.replaceAll(runId, plan.steps);
    emit({
      type: "plan.created",
      message: `Planned ${plan.steps.length} steps.`,
      data: plan,
    });

    /* --------------------------------------------------------------- steps */
    runs.setStatus(runId, "running");
    let replans = 0;

    for (;;) {
      const all = steps.list(runId);
      const next = pickNextStep(all);

      if (!next) break;

      const outcome = await runStep({
        runId,
        goal: run.goal,
        restatedGoal: plan.restatedGoal,
        step: next,
        registry,
        ctx,
        emit,
        notes,
      });

      if (outcome.kind === "passed" || outcome.kind === "failed") continue;

      if (outcome.kind === "replan") {
        if (replans >= config.limits.maxReplans) {
          notes.push("Hit the replan limit; stopped revising the plan.");
          steps.setStatus(runId, next.stepId, "failed", outcome.reason);
          continue;
        }
        replans += 1;
        plan = await makePlan(
          run.goal,
          recipes.forScope(scope),
          `Step ${next.stepId} ("${next.title}") could not be completed as planned. ` +
            `${outcome.reason}\n\nFacts established so far:\n${renderFactLines(memory.all(runId))}`,
        );
        runs.setPlan(runId, plan);
        steps.replaceAll(runId, plan.steps);
        notes.push(`Revised the plan after step ${next.stepId}: ${outcome.reason}`);
        emit({
          type: "plan.revised",
          level: "warn",
          message: `Revised the plan (${replans} of ${config.limits.maxReplans}).`,
          data: plan,
        });
        continue;
      }

      if (outcome.kind === "budget_exhausted") {
        notes.push("Ran out of the action budget for this task.");
        break;
      }
    }

    /* -------------------------------------------------------------- verify */
    runs.setStatus(runId, "verifying");
    emit({ type: "run.status", message: "Checking the work independently." });

    const facts = memory.all(runId);
    const evidence = await gatherEvidence({
      goal: run.goal,
      finalVerification: plan.finalVerification,
      facts,
      registry,
      ctx: { ...ctx, stepId: null },
    });

    const finalSteps = steps.list(runId);
    const verdict = await verify({
      goal: run.goal,
      restatedGoal: plan.restatedGoal,
      steps: finalSteps,
      facts,
      finalVerification: plan.finalVerification,
      evidence,
      notes,
    });

    emit({
      type: "verification.finished",
      level: verdict.achieved ? "info" : "error",
      message: verdict.achieved
        ? `Verified: the objective was achieved (${verdict.confidence} confidence).`
        : `Verification failed: the objective was not achieved.`,
      data: { verdict, evidence },
    });

    runs.finish(runId, verdict.achieved ? "succeeded" : "failed", {
      summary: verdict.summary,
      verdict,
      error: verdict.achieved ? null : "Verification did not confirm the objective.",
    });
    emit({
      type: "run.finished",
      level: verdict.achieved ? "info" : "error",
      message: verdict.summary,
      data: { verdict },
    });

    /* ---------------------------------------------------------------- learn */
    await learnFromRun(runId, run.goal, scope, finalSteps, notes).catch(() => {
      // Learning is a nicety. It must never turn a completed run into a failed one.
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit({ type: "run.finished", level: "error", message: `The run stopped: ${message}` });
    runs.finish(runId, "failed", {
      error: message,
      summary: `This task did not complete. ${message}`,
    });
  } finally {
    // Any approval still pending would otherwise sit in the UI forever.
    for (const pending of interventions.pendingForRun(runId)) interventions.expire(pending.id);
    await browser.close();
  }
}

/* -------------------------------------------------------------------------- */
/* One step                                                                   */
/* -------------------------------------------------------------------------- */

type StepOutcome =
  | { kind: "passed" }
  | { kind: "failed"; reason: string }
  | { kind: "replan"; reason: string }
  | { kind: "budget_exhausted" };

async function runStep(input: {
  runId: string;
  goal: string;
  restatedGoal: string;
  step: StepRecord;
  registry: ToolRegistry;
  ctx: ToolContext;
  emit: (e: NewEvent) => void;
  notes: string[];
}): Promise<StepOutcome> {
  const { runId, step, registry, emit } = input;
  const ctx: ToolContext = { ...input.ctx, stepId: step.stepId };

  steps.setStatus(runId, step.stepId, "running");
  emit({
    type: "step.started",
    stepId: step.stepId,
    message: step.title,
    data: { intent: step.intent, successCriterion: step.successCriterion },
  });

  const actions: ActionRecord[] = [];
  let hint: string | undefined;

  for (let attempt = 1; attempt <= config.limits.maxStepAttempts; attempt++) {
    steps.bumpAttempts(runId, step.stepId);

    const attemptResult = await runAttempt({
      runId,
      goal: input.goal,
      restatedGoal: input.restatedGoal,
      step,
      attempt,
      hint,
      registry,
      ctx,
      emit,
      actions,
    });

    if (attemptResult === "budget_exhausted") return { kind: "budget_exhausted" };

    const verdict = await critique({
      goal: input.goal,
      step,
      attempt,
      maxAttempts: config.limits.maxStepAttempts,
      transcript: renderTranscript(actions),
      facts: memory.all(runId),
      claimed: attemptResult === "claimed",
    });

    for (const fact of verdict.facts) {
      memory.write(runId, fact.key, fact.value, fact.source ?? `critic, step ${step.stepId}`);
    }

    emit({
      type: "critique",
      stepId: step.stepId,
      level: verdict.outcome === "pass" ? "info" : "warn",
      message: `Review of ${step.stepId}: ${verdict.outcome} — ${verdict.reasoning}`,
      data: verdict,
    });

    if (verdict.outcome === "pass") {
      steps.setStatus(runId, step.stepId, "passed", verdict.evidence);
      emit({
        type: "step.finished",
        stepId: step.stepId,
        message: `Done: ${step.title}`,
        data: { status: "passed", evidence: verdict.evidence },
      });
      return { kind: "passed" };
    }

    if (verdict.outcome === "replan") {
      emit({
        type: "step.finished",
        stepId: step.stepId,
        level: "warn",
        message: `Needs a different plan: ${step.title}`,
        data: { status: "failed", reasoning: verdict.reasoning },
      });
      return { kind: "replan", reason: verdict.reasoning };
    }

    if (verdict.outcome === "escalate") {
      let guidance: string;
      try {
        guidance = await input.ctx.askHuman(
          `I am stuck on "${step.title}".\n\n${verdict.reasoning}\n\n` +
            `What would you like me to do?`,
        );
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        steps.setStatus(runId, step.stepId, "failed", `Escalated and no answer came back: ${reason}`);
        input.notes.push(`Step ${step.stepId} escalated to a human and got no answer.`);
        return { kind: "failed", reason };
      }
      input.notes.push(`Step ${step.stepId} needed human guidance: "${guidance}"`);
      hint = `You escalated this to the user. They replied: "${guidance}". Act on that.`;
      continue;
    }

    // retry
    hint = verdict.nextActionHint ?? verdict.reasoning;
    if (attempt === config.limits.maxStepAttempts) {
      steps.setStatus(runId, step.stepId, "failed", verdict.reasoning);
      emit({
        type: "step.finished",
        stepId: step.stepId,
        level: "error",
        message: `Gave up on: ${step.title}`,
        data: { status: "failed", reasoning: verdict.reasoning },
      });
      input.notes.push(`Step ${step.stepId} ("${step.title}") failed: ${verdict.reasoning}`);
      return { kind: "failed", reason: verdict.reasoning };
    }
  }

  return { kind: "failed", reason: "Exhausted attempts." };
}

/* -------------------------------------------------------------------------- */
/* One attempt: the observe → decide → act cycle                              */
/* -------------------------------------------------------------------------- */

type AttemptResult = "claimed" | "blocked" | "out_of_actions" | "budget_exhausted";

async function runAttempt(input: {
  runId: string;
  goal: string;
  restatedGoal: string;
  step: StepRecord;
  attempt: number;
  hint?: string;
  registry: ToolRegistry;
  ctx: ToolContext;
  emit: (e: NewEvent) => void;
  actions: ActionRecord[];
}): Promise<AttemptResult> {
  const { runId, registry, ctx, emit, actions } = input;
  let repeats = 0;
  let lastSignature = "";

  for (let i = 0; i < MAX_ACTIONS_PER_ATTEMPT; i++) {
    const used = runs.get(runId)?.actionsUsed ?? 0;
    const remaining = config.limits.maxRunActions - used;
    if (remaining <= 0) {
      emit({
        type: "log",
        level: "error",
        message: `Stopped: used the whole budget of ${config.limits.maxRunActions} actions.`,
      });
      return "budget_exhausted";
    }

    const chosen = await llm.act({
      system: actorSystem(),
      prompt: actorPrompt({
        goal: input.goal,
        restatedGoal: input.restatedGoal,
        steps: steps.list(runId),
        step: input.step,
        attempt: input.attempt,
        maxAttempts: config.limits.maxStepAttempts,
        hint: input.hint,
        facts: memory.all(runId),
        recipes: recipes.forScope(new URL(config.baseUrl).host),
        history: actions.slice(-12).map(summariseAction),
        latestObservation: actions.at(-1)?.result.observation ?? null,
        actionsRemaining: remaining,
      }),
      tools: registry.list(),
    });

    emit({
      type: "action.proposed",
      stepId: input.step.stepId,
      message: chosen.rationale || `Calling ${chosen.tool}`,
      data: { tool: chosen.tool, args: chosen.args, rationale: chosen.rationale },
    });

    runs.bumpActions(runId);
    const result = await registry.execute(chosen.tool, chosen.args, ctx);
    actions.push({ tool: chosen.tool, args: chosen.args, rationale: chosen.rationale, result });

    for (const artifact of result.artifacts ?? []) artifacts.add(runId, artifact);

    emit({
      type: "action.result",
      stepId: input.step.stepId,
      level: result.ok ? "info" : "warn",
      message: `${chosen.tool} ${result.ok ? "succeeded" : `failed: ${result.error?.message ?? "unknown"}`}`,
      data: {
        tool: chosen.tool,
        ok: result.ok,
        error: result.error,
        observation: result.observation.slice(0, 2000),
        artifacts: result.artifacts ?? [],
      },
    });

    if (chosen.tool === FINISH_STEP) return "claimed";
    if (chosen.tool === REPORT_BLOCKED) return "blocked";

    // Loop guard. A model that keeps firing the same failing call is not going
    // to think its way out by firing it again; ending the attempt hands the
    // problem to the critic, which can change the approach or escalate.
    const signature = `${chosen.tool}:${JSON.stringify(chosen.args)}`;
    if (!result.ok && signature === lastSignature) {
      repeats += 1;
      if (repeats >= REPEAT_LIMIT) {
        emit({
          type: "log",
          stepId: input.step.stepId,
          level: "warn",
          message: `The same failing action was tried ${repeats} times in a row. Stopping this attempt.`,
        });
        return "out_of_actions";
      }
    } else {
      repeats = 0;
    }
    lastSignature = signature;
  }

  return "out_of_actions";
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Next step whose dependencies have all passed. */
function pickNextStep(all: StepRecord[]): StepRecord | null {
  const byId = new Map(all.map((s) => [s.stepId, s]));
  for (const step of all) {
    if (step.status !== "pending") continue;
    const blocked = step.dependsOn.some((d) => byId.get(d)?.status !== "passed");
    if (!blocked) return step;
  }
  return null;
}

function summariseAction(a: ActionRecord): string {
  const args = JSON.stringify(a.args);
  const head = a.result.observation.replace(/\s+/g, " ").slice(0, 160);
  return `- ${a.tool}(${args.length > 160 ? `${args.slice(0, 160)}…` : args}) → ${
    a.result.ok ? "ok" : `FAILED [${a.result.error?.kind}]`
  }: ${head}`;
}

/** The critic sees compressed history plus the last two observations in more
 *  detail, which is where the evidence for completion usually is. */
function renderTranscript(actions: ActionRecord[]): string {
  if (actions.length === 0) return "(the agent took no actions)";
  return actions
    .map((a, i) => {
      const detailed = i >= actions.length - 2;
      const limit = detailed ? 2200 : 300;
      return [
        `[${i + 1}] ${a.tool}(${JSON.stringify(a.args)})`,
        a.rationale ? `    reason: ${a.rationale}` : "",
        `    result: ${a.result.ok ? "ok" : `FAILED (${a.result.error?.kind}: ${a.result.error?.message})`}`,
        `    observed: ${a.result.observation.slice(0, limit)}${
          a.result.observation.length > limit ? "…[truncated]" : ""
        }`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

function renderFactLines(facts: MemoryFact[]): string {
  return facts.length === 0
    ? "(none)"
    : facts.map((f) => `- ${f.key} = "${f.value}"`).join("\n");
}

function makeToolContext(input: {
  runId: string;
  browser: BrowserSession;
  emit: (e: NewEvent) => void;
  human: HumanGateway;
}): ToolContext {
  const { runId, browser, emit, human } = input;

  return {
    runId,
    stepId: null,
    emit,
    browser,
    memory: {
      write(key, value, source) {
        memory.write(runId, key, value, source);
        emit({
          type: "memory.written",
          message: `Remembered ${key} = "${value}"`,
          data: { key, value, source },
        });
      },
      read: (key) => memory.read(runId, key),
      all: () => memory.all(runId),
    },
    async requestApproval(request) {
      const response = await human.ask({
        runId,
        kind: "approval",
        prompt: request.consequence,
        tool: request.tool,
        args: request.args,
        emit,
      });
      return readApproval(response);
    },
    async askHuman(question, options) {
      return human.ask({ runId, kind: "question", prompt: question, options, emit });
    },
    saveArtifact(kind, label, bytes, ext) {
      const dir = path.join(config.artifactsDir, runId);
      fs.mkdirSync(dir, { recursive: true });
      const id = `${Date.now().toString(36)}-${nanoid(6)}`;
      const file = `${id}.${ext}`;
      fs.writeFileSync(path.join(dir, file), bytes);
      const artifact: Artifact = {
        id,
        kind,
        label,
        url: `${config.artifactsUrlBase}/${runId}/${file}`,
        path: path.join(dir, file),
      };
      artifacts.add(runId, artifact);
      return artifact;
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Cross-run learning                                                         */
/* -------------------------------------------------------------------------- */

const RecipeSchema = z.object({
  notes: z
    .array(z.object({ title: z.string(), body: z.string() }))
    .describe("Reusable operating notes about these systems; may be empty"),
});

/**
 * Distils reusable notes about the environment from a finished run.
 *
 * This is what makes the second run of a task cheaper than the first: the
 * quirks the agent had to discover by trial — the sort order, the strict field
 * formats, the document service that fails once — get written down and shown
 * to future runs. Deliberately scoped to how the *systems* behave, never to
 * the task, so a note learned while entering an invoice helps a reconciliation
 * task too.
 */
async function learnFromRun(
  runId: string,
  goal: string,
  scope: string,
  finalSteps: StepRecord[],
  notes: string[],
): Promise<void> {
  const trail = events
    .list(runId)
    .filter((e) => e.type === "action.result" || e.type === "critique")
    .slice(-40)
    .map((e) => `${e.type}: ${e.message}`)
    .join("\n");

  const result = await llm.json({
    schema: RecipeSchema,
    system: recipeSystem(),
    prompt: [
      `TASK THAT WAS ATTEMPTED\n${goal}`,
      `STEP OUTCOMES\n${finalSteps.map((s) => `- ${s.stepId} [${s.status}] ${s.title}`).join("\n")}`,
      notes.length > 0 ? `NOTABLE EVENTS\n${notes.join("\n")}` : "",
      `TRAIL\n${trail}`,
      `Extract reusable operating notes.`,
    ]
      .filter(Boolean)
      .join("\n\n---\n\n"),
    tier: "fast",
    temperature: 0.2,
    label: "recipe-extractor",
  });

  for (const note of result.notes.slice(0, 6)) {
    recipes.upsert(scope, note.title, note.body);
  }

  if (result.notes.length > 0) {
    events.append(runId, {
      type: "log",
      message: `Wrote ${result.notes.length} operating note(s) to long-term memory.`,
      data: result.notes,
    });
  }
}
