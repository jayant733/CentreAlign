import { z } from "zod";
import type { ApprovalDecision, ToolContext, ToolDefinition, ToolErrorKind, ToolResult } from "../types";

/**
 * The tool registry is the agent's entire capability surface. The loop knows
 * nothing about browsers, PDFs or HTTP — it knows how to pick a tool, run it,
 * and read the result. Adding a capability therefore never means touching the
 * loop, which is what lets the same agent handle a different task.
 */
export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): this {
    if (this.tools.has(tool.name)) {
      throw new Error(`Duplicate tool name: ${tool.name}`);
    }
    this.tools.set(tool.name, { origin: { kind: "builtin" }, ...tool });
    return this;
  }

  registerAll(tools: ToolDefinition[]): this {
    for (const t of tools) this.register(t);
    return this;
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  names(): string[] {
    return [...this.tools.keys()];
  }

  /**
   * Runs a tool by name.
   *
   * Every failure mode returns a ToolResult rather than throwing: a bad
   * argument, an unknown tool name and a crashed browser action all become
   * observations the agent can read and react to. An agent that can see "you
   * passed a string where a number was required" fixes itself on the next
   * turn; an agent that gets an exception just dies.
   */
  async execute(
    name: string,
    rawArgs: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.get(name);
    if (!tool) {
      return {
        ok: false,
        observation:
          `There is no tool called "${name}". Available tools: ${this.names().join(", ")}.`,
        error: { kind: "bad_args", message: `Unknown tool ${name}`, retryable: false },
      };
    }

    const parsed = tool.parameters.safeParse(rawArgs);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      return {
        ok: false,
        observation:
          `The arguments for ${name} were rejected: ${issues}. ` +
          `Call ${name} again with corrected arguments.`,
        error: { kind: "bad_args", message: issues, retryable: false },
      };
    }

    // Irreversible actions never execute on the agent's own authority.
    let approval: ApprovalDecision | undefined;
    if (tool.risk === "dangerous") {
      const decision = await ctx.requestApproval({
        tool: name,
        args: parsed.data as Record<string, unknown>,
        consequence: describeConsequence(tool, parsed.data),
      });
      if (!decision.approved) {
        return {
          ok: false,
          observation:
            `A human declined to approve ${name}.` +
            (decision.note ? ` They said: "${decision.note}".` : "") +
            ` Do not attempt this action again. Either continue with the rest of the task or ` +
            `report that it cannot be completed.`,
          error: { kind: "blocked", message: "Denied by human reviewer", retryable: false },
        };
      }
      approval = decision;
    }

    try {
      return await tool.run(parsed.data, ctx, approval);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        observation: `${name} threw an unexpected error: ${message}`,
        error: { kind: classify(message), message, retryable: isRetryable(message) },
      };
    }
  }
}

function describeConsequence(tool: ToolDefinition, args: unknown): string {
  if (tool.describeConsequence) return tool.describeConsequence(args);
  return `Run ${tool.name}, which is marked irreversible. ${tool.description}`;
}

export function classify(message: string): ToolErrorKind {
  if (/timeout|timed out|exceeded/i.test(message)) return "timeout";
  if (/401|unauthor|forbidden|403|sign in|login/i.test(message)) return "auth";
  if (/404|not found|no such|missing/i.test(message)) return "not_found";
  if (/5\d\d|server error|unavailable/i.test(message)) return "server_error";
  return "unknown";
}

export function isRetryable(message: string): boolean {
  return /timeout|timed out|5\d\d|unavailable|temporarily|econnreset|socket hang up|detached|stale/i.test(
    message,
  );
}

/** Shared helper so tools declare schemas consistently. */
export const S = z;
