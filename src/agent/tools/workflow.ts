import { z } from "zod";
import { config } from "../config";
import type { ToolDefinition, ToolResult } from "../types";

/**
 * Tools that are about the work itself rather than about any one system:
 * recording facts, involving a human, and the two control signals the agent
 * uses to end a step.
 */

/** The agent claims the current step is done; the critic decides whether it is. */
export const FINISH_STEP = "finish_step";
/** The agent cannot proceed and wants a human. */
export const REPORT_BLOCKED = "report_blocked";

export const workflowTools: ToolDefinition[] = [
  {
    name: "remember",
    description:
      "Record a fact you have discovered so later steps can use it. Store the things the task " +
      "depends on — an amount, a date, a reference number, a URL — as soon as you read them, " +
      "with the exact value as it appeared. Facts you record are shown to you on every " +
      "subsequent turn and are used to check the final result.",
    risk: "safe",
    parameters: z.object({
      key: z
        .string()
        .min(1)
        .describe("Short snake_case identifier, e.g. invoice_total_amount"),
      value: z.string().min(1).describe("The exact value, verbatim from the source"),
      source: z
        .string()
        .min(1)
        .describe("Where it came from, e.g. 'INV-ACM-2012.pdf, TOTAL DUE line'"),
    }),
    async run({ key, value, source }, ctx): Promise<ToolResult> {
      ctx.memory.write(key, value, source);
      return {
        ok: true,
        observation: `Recorded ${key} = "${value}" (source: ${source}).`,
        data: { key, value, source },
      };
    },
  },

  {
    name: "ask_human",
    description:
      "Ask the person who requested the task a question, and wait for their answer. Use this only " +
      "when the task is genuinely ambiguous and guessing could produce the wrong outcome — for " +
      "example when the request names something that matches several records, or omits a value " +
      "you cannot derive. Do not use it for things you could find out yourself.",
    risk: "safe",
    parameters: z.object({
      question: z.string().min(1),
      options: z
        .array(z.string())
        .optional()
        .describe("Concrete choices, when the answer is one of a known set"),
    }),
    async run({ question, options }, ctx): Promise<ToolResult> {
      const answer = await ctx.askHuman(question, options);
      return {
        ok: true,
        observation: `You asked: "${question}"\nThe user answered: "${answer}"`,
        data: { question, answer },
      };
    },
  },

  {
    name: "pay_bill",
    description:
      "Release a payment against a bill in NimbusERP. This moves money, cannot be undone, and " +
      "always requires explicit human approval before it runs. Identify the bill by its supplier " +
      "invoice number.",
    risk: "dangerous",
    parameters: z.object({
      invoice_number: z.string().min(1),
      approved_by: z
        .string()
        .min(1)
        .describe("Who authorised this, as told to you by the human approver"),
    }),
    async run({ invoice_number, approved_by }): Promise<ToolResult> {
      const res = await fetch(new URL("/api/sandbox/erp/payments", config.baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoice_number, approved_by }),
      });
      const body = await res.text();

      if (!res.ok) {
        return {
          ok: false,
          observation: `Payment was rejected (HTTP ${res.status}): ${body}`,
          error: {
            kind: res.status === 404 ? "not_found" : "server_error",
            message: body.slice(0, 300),
            retryable: res.status >= 500,
          },
        };
      }

      return {
        ok: true,
        observation: `Payment released. The ERP returned: ${body}`,
        data: JSON.parse(body),
      };
    },
  },

  {
    name: FINISH_STEP,
    description:
      "Declare that the current step's success criterion is now satisfied. Say what you did and " +
      "point at the evidence. Your claim is checked independently before the run moves on, so " +
      "calling this without having actually achieved the criterion will simply send you back.",
    risk: "safe",
    parameters: z.object({
      summary: z
        .string()
        .min(1)
        .describe("What you did and the observation that proves the criterion is met"),
    }),
    async run({ summary }): Promise<ToolResult> {
      return {
        ok: true,
        observation: `Step completion claimed: ${summary}`,
        data: { summary },
      };
    },
  },

  {
    name: REPORT_BLOCKED,
    description:
      "Report that you cannot complete the current step and explain why. Use this after you have " +
      "genuinely tried alternatives — not on the first failure. Say what you attempted and what " +
      "a human would need to do.",
    risk: "safe",
    parameters: z.object({
      reason: z.string().min(1),
      attempted: z.string().min(1).describe("What you already tried"),
    }),
    async run({ reason, attempted }): Promise<ToolResult> {
      return {
        ok: true,
        observation: `Reported blocked: ${reason} (attempted: ${attempted})`,
        data: { reason, attempted },
      };
    },
  },
];
