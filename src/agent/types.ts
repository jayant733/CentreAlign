import type { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Runs and steps                                                             */
/* -------------------------------------------------------------------------- */

export type RunStatus =
  | "queued"
  | "planning"
  | "running"
  | "awaiting_human"
  | "verifying"
  | "succeeded"
  | "failed"
  | "cancelled";

export const TERMINAL_RUN_STATUSES: RunStatus[] = [
  "succeeded",
  "failed",
  "cancelled",
];

export type StepStatus = "pending" | "running" | "passed" | "failed" | "skipped";

/**
 * One node of the task graph. The agent is told the *criterion*, never the
 * clicks: deciding how to satisfy a criterion is the whole job.
 */
export interface PlanStep {
  id: string;
  title: string;
  /** What this step is for, in prose. */
  intent: string;
  /** An observable condition that makes this step done. The critic judges
   *  each attempt against exactly this string. */
  successCriterion: string;
  /** Step ids that must pass first. Makes the plan a DAG, not a list. */
  dependsOn: string[];
}

export interface TaskPlan {
  /** The agent's own restatement of the goal, used to catch misreadings early. */
  restatedGoal: string;
  steps: PlanStep[];
  /** How the end state should be checked through a path independent of the
   *  one used to perform the work. */
  finalVerification: string;
  /** Ambiguities that genuinely block safe execution. Non-empty means the
   *  run pauses and asks the user before touching anything. */
  blockingQuestions: string[];
}

export interface RunRecord {
  id: string;
  goal: string;
  status: RunStatus;
  plan: TaskPlan | null;
  summary: string | null;
  verdict: Verdict | null;
  error: string | null;
  actionsUsed: number;
  createdAt: number;
  updatedAt: number;
}

export interface StepRecord {
  runId: string;
  stepId: string;
  title: string;
  intent: string;
  successCriterion: string;
  dependsOn: string[];
  status: StepStatus;
  attempts: number;
  outcome: string | null;
}

/* -------------------------------------------------------------------------- */
/* Tools                                                                      */
/* -------------------------------------------------------------------------- */

export type ToolRisk =
  /** Read-only. Runs without asking. */
  | "safe"
  /** Mutates sandbox state but is reversible and cheap. Runs without asking. */
  | "write"
  /** Irreversible or externally visible. Always needs human approval. */
  | "dangerous";

export type ToolErrorKind =
  | "not_found"
  | "timeout"
  | "auth"
  | "server_error"
  | "bad_args"
  | "blocked"
  | "unknown";

export interface ToolError {
  kind: ToolErrorKind;
  message: string;
  /** Whether retrying the identical call could plausibly succeed. Drives the
   *  difference between "try again" and "try something else". */
  retryable: boolean;
}

export interface Artifact {
  id: string;
  kind: "screenshot" | "file" | "json" | "text";
  label: string;
  /** Public URL, when the artifact is web-servable. */
  url?: string;
  /** Absolute path on disk. */
  path?: string;
}

export interface ToolResult {
  ok: boolean;
  /** The agent's entire view of what happened. Written for an LLM reader:
   *  compact, concrete, and never raw HTML. */
  observation: string;
  /** Structured payload, used for fact extraction and verification. */
  data?: unknown;
  error?: ToolError;
  artifacts?: Artifact[];
}

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  /** The model's stated reason for this call. Surfaced in the UI trace and
   *  invaluable when debugging why the agent did something odd. */
  rationale?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ToolDefinition<A = any> {
  name: string;
  /** Shown to the model. This is prompt surface, so it matters: say what the
   *  tool is for, and when *not* to use it. */
  description: string;
  parameters: z.ZodType<A>;
  risk: ToolRisk;
  /** For dangerous tools: the consequence in plain words, shown to the approver. */
  describeConsequence?: (args: A) => string;
  /**
   * Schema to advertise to the model, when it cannot be derived from
   * `parameters`. MCP servers publish JSON Schema directly, so their tools
   * supply it here and keep a permissive Zod type for local validation.
   */
  rawJsonSchema?: Record<string, unknown>;
  /** Where the tool came from. Local tools and MCP-discovered tools are
   *  treated identically by the loop. */
  origin?: { kind: "builtin" } | { kind: "mcp"; server: string };
  /** `approval` is set for dangerous tools: the human decision that let it run. */
  run(args: A, ctx: ToolContext, approval?: ApprovalDecision): Promise<ToolResult>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Everything a tool is allowed to reach. Passed in rather than imported so
 *  tools stay testable and cannot grab global state. */
export interface ToolContext {
  runId: string;
  stepId: string | null;
  emit: (event: NewEvent) => void;
  memory: {
    write: (key: string, value: string, source: string) => void;
    read: (key: string) => string | undefined;
    all: () => MemoryFact[];
  };
  browser: BrowserSessionHandle;
  /** Blocks until a human responds, or throws on timeout/denial. */
  requestApproval: (req: ApprovalRequest) => Promise<ApprovalDecision>;
  askHuman: (question: string, options?: string[]) => Promise<string>;
  saveArtifact: (
    kind: Artifact["kind"],
    label: string,
    bytes: Buffer | string,
    ext: string,
  ) => Artifact;
}

/** Minimal surface the browser tools need, so the session can be swapped
 *  (e.g. for a CDP or computer-use backend) without touching tool code. */
export interface BrowserSessionHandle {
  page(): Promise<import("playwright").Page>;
  isOpen(): boolean;
  close(): Promise<void>;
}

/* -------------------------------------------------------------------------- */
/* Judgement                                                                  */
/* -------------------------------------------------------------------------- */

export type CritiqueOutcome =
  /** Criterion met. Move to the next step. */
  | "pass"
  /** Not met, but the same approach is still the right one. */
  | "retry"
  /** The plan itself is wrong given what we now know. */
  | "replan"
  /** Cannot proceed safely or capably. Hand to the human. */
  | "escalate";

export interface Critique {
  outcome: CritiqueOutcome;
  reasoning: string;
  /** Concrete observation that justifies the verdict. Forces the critic to
   *  point at evidence instead of vibing. */
  evidence: string;
  /** Durable facts discovered while doing this step. */
  facts: MemoryFact[];
  /** Advice carried into the next attempt. */
  nextActionHint?: string;
}

export interface VerificationCheck {
  description: string;
  passed: boolean;
  evidence: string;
}

export interface Verdict {
  achieved: boolean;
  confidence: "high" | "medium" | "low";
  checks: VerificationCheck[];
  summary: string;
}

/* -------------------------------------------------------------------------- */
/* Memory                                                                     */
/* -------------------------------------------------------------------------- */

export interface MemoryFact {
  key: string;
  value: string;
  /** Where it came from, so the verifier can tell a fact read off a real
   *  invoice from one the model inferred. */
  source?: string;
}

/** A reusable lesson about an environment, carried across runs. */
export interface Recipe {
  id: string;
  /** e.g. "localhost:3000/portal" */
  scope: string;
  title: string;
  body: string;
  uses: number;
  successes: number;
  updatedAt: number;
}

/* -------------------------------------------------------------------------- */
/* Human in the loop                                                          */
/* -------------------------------------------------------------------------- */

export interface ApprovalRequest {
  tool: string;
  args: Record<string, unknown>;
  /** Plain-language description of the consequence, for the approval card. */
  consequence: string;
}

export interface ApprovalDecision {
  approved: boolean;
  note?: string;
}

export type InterventionKind = "approval" | "question";
export type InterventionStatus = "pending" | "resolved" | "expired";

export interface InterventionRecord {
  id: string;
  runId: string;
  kind: InterventionKind;
  status: InterventionStatus;
  /** Question text, or the consequence description for approvals. */
  prompt: string;
  tool: string | null;
  args: Record<string, unknown> | null;
  options: string[] | null;
  response: string | null;
  createdAt: number;
  resolvedAt: number | null;
}

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

export type EventType =
  | "run.created"
  | "run.status"
  | "plan.created"
  | "plan.revised"
  | "step.started"
  | "step.finished"
  | "thought"
  | "action.proposed"
  | "action.result"
  | "critique"
  | "memory.written"
  | "intervention.requested"
  | "intervention.resolved"
  | "verification.finished"
  | "run.finished"
  | "log";

export interface NewEvent {
  type: EventType;
  stepId?: string | null;
  /** Short human-readable line for the live trace. */
  message: string;
  /** Structured detail for the UI to render richly. */
  data?: unknown;
  level?: "info" | "warn" | "error";
}

export interface EventRecord extends NewEvent {
  id: number;
  runId: string;
  ts: number;
}
