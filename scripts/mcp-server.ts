import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { nanoid } from "nanoid";
import { z } from "zod";
import { config } from "@/agent/config";
import { interventions, runs, steps } from "@/agent/db";
import { buildRegistry } from "@/agent/tools";

/**
 * Praxis as an MCP server.
 *
 * Other agents can hand Praxis a task, read how it went, and answer the
 * approvals it raises, without knowing anything about the web UI. This process
 * only enqueues and reads. The worker still does the work, which is why a
 * client is told to have `npm run worker` running.
 *
 * Speak on stderr only. stdout belongs to the MCP transport.
 */

const server = new McpServer({ name: "praxis", version: "0.1.0" });

function text(body: unknown) {
  return { content: [{ type: "text" as const, text: typeof body === "string" ? body : JSON.stringify(body, null, 2) }] };
}

server.registerTool(
  "run_task",
  {
    title: "Run a task",
    description:
      "Hand Praxis a task in plain language. Returns a case id immediately. The work happens in the " +
      "background, so call get_run to follow it, and approve_action when the status is awaiting_human. " +
      "Requires the Praxis worker to be running.",
    inputSchema: {
      goal: z.string().min(8).describe("The task, the way you would hand it to a colleague"),
    },
  },
  async ({ goal }) => {
    const id = nanoid(10);
    const run = runs.create(id, goal.trim());
    return text({
      id: run.id,
      status: run.status,
      url: `${config.baseUrl}/runs/${run.id}`,
      note: "Queued. The worker picks it up within a second if `npm run worker` is running.",
    });
  },
);

server.registerTool(
  "get_run",
  {
    title: "Read a case",
    description:
      "The current state of a Praxis case: status, plan, summary, verdict, and anything waiting on a human. " +
      "Poll this. A run takes minutes.",
    inputSchema: { id: z.string().describe("Case id returned by run_task") },
  },
  async ({ id }) => {
    const run = runs.get(id);
    if (!run) return text(`No case with id ${id}.`);
    return text({
      id: run.id,
      goal: run.goal,
      status: run.status,
      actionsUsed: run.actionsUsed,
      summary: run.summary,
      verdict: run.verdict,
      error: run.error,
      steps: steps.list(id).map((s) => ({
        id: s.stepId,
        title: s.title,
        status: s.status,
        attempts: s.attempts,
      })),
      pending: interventions.pendingForRun(id).map((p) => ({
        id: p.id,
        kind: p.kind,
        prompt: p.prompt,
        tool: p.tool,
        args: p.args,
      })),
      url: `${config.baseUrl}/runs/${run.id}`,
    });
  },
);

server.registerTool(
  "approve_action",
  {
    title: "Answer a waiting case",
    description:
      "Resolve an approval or a question that get_run reported as pending. For an approval, start the " +
      "response with 'yes' or 'no'. Anything after the first word is recorded as the approver's note.",
    inputSchema: {
      id: z.string().describe("The pending intervention id, not the case id"),
      response: z.string().min(1).describe("yes, no, or the answer to the question"),
    },
  },
  async ({ id, response }) => {
    const record = interventions.get(id);
    if (!record) return text(`No request with id ${id}.`);
    if (record.status !== "pending") return text(`That request is already ${record.status}.`);
    const resolved = interventions.resolve(id, response.trim());
    return text({
      id,
      status: resolved?.status,
      runId: record.runId,
      note: "The worker picks this up on its next poll.",
    });
  },
);

server.registerTool(
  "list_capabilities",
  {
    title: "List what Praxis can do",
    description: "The tools the worker can use, and which of them stop for human approval.",
    inputSchema: {},
  },
  async () => {
    const tools = buildRegistry().list().map((t) => ({
      name: t.name,
      risk: t.risk,
      description: t.description,
    }));
    return text({ tools });
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[praxis-mcp] serving run_task, get_run, approve_action, list_capabilities on stdio");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
