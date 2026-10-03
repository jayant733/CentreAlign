import { nanoid } from "nanoid";
import { interventions, runs } from "./db";
import { config } from "./config";
import type { InterventionKind, NewEvent, RunStatus } from "./types";

/**
 * How the agent reaches a human.
 *
 * Abstracted because the two ways of running the agent need different
 * mechanics: the worker parks the run in the database and the web UI answers
 * it, while the CLI just asks on the terminal. The loop itself only knows it
 * can ask a question and will eventually get a string back.
 */
export interface HumanGateway {
  ask(input: {
    runId: string;
    kind: InterventionKind;
    prompt: string;
    tool?: string;
    args?: Record<string, unknown>;
    options?: string[];
    emit: (e: NewEvent) => void;
  }): Promise<string>;
}

/**
 * Parks the run and waits for the UI to resolve it.
 *
 * The run's status becomes `awaiting_human`, which is what makes a waiting run
 * visible rather than looking like a hang, and the previous status is restored
 * afterwards so the loop resumes where it was. Polling rather than an event
 * bus keeps this working across two processes without extra infrastructure.
 */
export class DatabaseHumanGateway implements HumanGateway {
  constructor(private pollMs = 1200) {}

  async ask(input: Parameters<HumanGateway["ask"]>[0]): Promise<string> {
    const id = nanoid(10);
    interventions.create({
      id,
      runId: input.runId,
      kind: input.kind,
      prompt: input.prompt,
      tool: input.tool ?? null,
      args: input.args ?? null,
      options: input.options ?? null,
    });

    const previous: RunStatus = runs.get(input.runId)?.status ?? "running";
    runs.setStatus(input.runId, "awaiting_human");
    input.emit({
      type: "intervention.requested",
      level: "warn",
      message:
        input.kind === "approval"
          ? `Waiting for approval: ${input.tool}`
          : `Waiting for an answer: ${input.prompt}`,
      data: { id, kind: input.kind, prompt: input.prompt, tool: input.tool, args: input.args, options: input.options },
    });

    const deadline = Date.now() + config.limits.humanTimeoutMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, this.pollMs));
      const record = interventions.get(id);
      if (record?.status === "resolved") {
        runs.setStatus(input.runId, previous);
        input.emit({
          type: "intervention.resolved",
          message: `Human responded: ${record.response}`,
          data: { id, response: record.response },
        });
        return record.response ?? "";
      }
      if (runs.get(input.runId)?.status === "cancelled") {
        throw new Error("Run was cancelled while waiting for a human.");
      }
    }

    interventions.expire(id);
    runs.setStatus(input.runId, previous);
    input.emit({
      type: "intervention.resolved",
      level: "error",
      message: "No human responded in time.",
      data: { id, expired: true },
    });
    // Failing safe: a request that times out is never treated as approval.
    throw new Error(
      `Timed out after ${Math.round(config.limits.humanTimeoutMs / 60000)} minutes waiting for a human to respond.`,
    );
  }
}

/** Terminal prompt, for `npm run task`. */
export class CliHumanGateway implements HumanGateway {
  async ask(input: Parameters<HumanGateway["ask"]>[0]): Promise<string> {
    const readline = await import("node:readline/promises");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    const banner =
      input.kind === "approval"
        ? `\n\n=== APPROVAL REQUIRED ===\n${input.prompt}\n\nApprove? (yes/no, optionally followed by a note): `
        : `\n\n=== THE AGENT IS ASKING YOU ===\n${input.prompt}\n${
            input.options?.length ? `Options: ${input.options.join(" | ")}\n` : ""
          }Your answer: `;

    input.emit({
      type: "intervention.requested",
      level: "warn",
      message: input.kind === "approval" ? `Approval required for ${input.tool}` : input.prompt,
      data: { kind: input.kind, prompt: input.prompt, tool: input.tool, args: input.args },
    });

    try {
      const answer = (await rl.question(banner)).trim();
      input.emit({
        type: "intervention.resolved",
        message: `You responded: ${answer}`,
        data: { response: answer },
      });
      return answer;
    } finally {
      rl.close();
    }
  }
}

/** Interprets a free-text human reply to an approval request. */
export function readApproval(response: string): { approved: boolean; note?: string } {
  const trimmed = response.trim();
  const approved = /^(y|yes|approve|approved|ok|okay|go ahead|do it)\b/i.test(trimmed);
  const note = trimmed.replace(/^\S+\s*/, "").trim();
  return { approved, note: note || undefined };
}
