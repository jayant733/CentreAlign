import type {
  Artifact,
  Critique,
  EventRecord,
  RunStatus,
  TaskPlan,
  Verdict,
} from "@/agent/types";

/**
 * Turns the raw event log into what a person reads: an action and its result
 * become one line, reviews and facts stand out, and system chatter is quiet.
 */

export type TrailEntry =
  | { kind: "system"; id: number; ts: number; text: string; level: "info" | "warn" | "error" }
  | { kind: "plan"; id: number; ts: number; text: string; revised: boolean; plan: TaskPlan }
  | { kind: "step"; id: number; ts: number; stepId: string; title: string }
  | {
      kind: "action";
      id: number;
      ts: number;
      stepId: string | null;
      tool: string;
      rationale: string;
      args: Record<string, unknown>;
      verifying: boolean;
      result?: { ok: boolean; error?: string; observation?: string; artifacts: Artifact[] };
    }
  | { kind: "review"; id: number; ts: number; stepId: string | null; critique: Critique }
  | { kind: "fact"; id: number; ts: number; key: string; value: string; source?: string }
  | { kind: "human"; id: number; ts: number; text: string; resolved: boolean; level: "info" | "warn" | "error" }
  | { kind: "verdict"; id: number; ts: number; verdict: Verdict }
  | { kind: "finished"; id: number; ts: number; text: string; level: "info" | "warn" | "error" };

type Data = Record<string, unknown>;

export function buildTrail(events: EventRecord[]): TrailEntry[] {
  const out: TrailEntry[] = [];
  const openAction = new Map<string, number>();

  for (const e of events) {
    const d = (e.data ?? {}) as Data;
    const level = e.level ?? "info";
    const base = { id: e.id, ts: e.ts };

    switch (e.type) {
      case "plan.created":
      case "plan.revised":
        out.push({ ...base, kind: "plan", text: e.message, revised: e.type === "plan.revised", plan: d as unknown as TaskPlan });
        break;
      case "step.started":
        out.push({ ...base, kind: "step", stepId: e.stepId ?? "?", title: e.message });
        break;
      case "action.proposed": {
        // A successful remember already appears as its own fact line.
        if (d.tool === "remember") break;
        out.push({
          ...base,
          kind: "action",
          stepId: e.stepId ?? null,
          tool: String(d.tool ?? "tool"),
          rationale: String(d.rationale ?? e.message),
          args: (d.args as Record<string, unknown>) ?? {},
          verifying: false,
        });
        openAction.set(e.stepId ?? "", out.length - 1);
        break;
      }
      case "thought":
        if (d.phase === "verification") {
          out.push({
            ...base,
            kind: "action",
            stepId: null,
            tool: String(d.tool ?? "check"),
            rationale: e.message.replace(/^Verifying:\s*/, ""),
            args: (d.args as Record<string, unknown>) ?? {},
            verifying: true,
          });
          openAction.set("", out.length - 1);
        } else {
          out.push({ ...base, kind: "system", text: e.message, level });
        }
        break;
      case "action.result": {
        const idx = openAction.get(e.stepId ?? "");
        const target = idx === undefined ? undefined : out[idx];
        const error = d.error as { message?: string } | undefined;
        const result = {
          ok: Boolean(d.ok),
          error: error?.message,
          observation: typeof d.observation === "string" ? d.observation : undefined,
          artifacts: (d.artifacts as Artifact[]) ?? [],
        };
        if (target?.kind === "action" && !target.result) target.result = result;
        openAction.delete(e.stepId ?? "");
        break;
      }
      case "critique":
        out.push({ ...base, kind: "review", stepId: e.stepId ?? null, critique: d as unknown as Critique });
        break;
      case "memory.written":
        out.push({ ...base, kind: "fact", key: String(d.key), value: String(d.value), source: d.source as string | undefined });
        break;
      case "intervention.requested":
        out.push({ ...base, kind: "human", text: e.message, resolved: false, level: "warn" });
        break;
      case "intervention.resolved":
        out.push({ ...base, kind: "human", text: e.message, resolved: true, level });
        break;
      case "verification.finished":
        if (d.verdict) out.push({ ...base, kind: "verdict", verdict: d.verdict as Verdict });
        break;
      case "run.finished":
        out.push({ ...base, kind: "finished", text: e.message, level });
        break;
      default:
        out.push({ ...base, kind: "system", text: e.message, level });
    }
  }
  return out;
}

export const STATUS_COPY: Record<RunStatus, { label: string; tone: "ink" | "tape" | "seal" | "oxide" }> = {
  queued: { label: "Waiting for a worker", tone: "ink" },
  planning: { label: "Planning", tone: "ink" },
  running: { label: "Working", tone: "ink" },
  awaiting_human: { label: "Needs you", tone: "tape" },
  verifying: { label: "Checking the work", tone: "ink" },
  succeeded: { label: "Verified", tone: "seal" },
  failed: { label: "Not done", tone: "oxide" },
  cancelled: { label: "Cancelled", tone: "ink" },
};

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
}

/** Tool names are for machines; the trail shows what the tool did. */
export function describeArgs(tool: string, args: Record<string, unknown>): string | null {
  const pick = (k: string) => (typeof args[k] === "string" || typeof args[k] === "number" ? String(args[k]) : null);
  switch (tool) {
    case "browser_open":
      return pick("url");
    case "browser_fill":
      return [pick("index") && `#${pick("index")}`, pick("value") && `“${pick("value")}”`].filter(Boolean).join(" ← ");
    case "browser_click":
    case "browser_select":
      return pick("index") ? `#${pick("index")}${pick("value") ? ` → ${pick("value")}` : ""}` : null;
    case "browser_press":
      return pick("key");
    case "browser_scroll":
      return pick("direction");
    case "read_pdf":
      return pick("url");
    case "http_request":
      return [pick("method"), pick("url")].filter(Boolean).join(" ");
    case "remember":
      return pick("key") ? `${pick("key")} = ${pick("value")}` : null;
    case "write_file":
    case "read_file":
      return pick("filename");
    default:
      return null;
  }
}
