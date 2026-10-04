import { runs } from "@/agent/db";
import { executeRun } from "@/agent/loop";
import { discoverMcpTools, shutdownMcpClients } from "@/agent/mcp/client";
import type { ToolDefinition } from "@/agent/types";

/**
 * The worker process.
 *
 * The HTTP API only enqueues runs; this process executes them. Separating the
 * two is worth the extra terminal: a task takes minutes and drives a real
 * browser, which is not work that belongs inside a request handler, and
 * because all state lives in Postgres the UI stays fully live while the worker
 * grinds. It also means a crashed worker leaves an inspectable trail instead
 * of taking the web app down with it.
 */

const POLL_MS = 900;
let shuttingDown = false;
let extraTools: ToolDefinition[] = [];

async function tick(): Promise<boolean> {
  const run = runs.claimNextQueued();
  if (!run) return false;

  console.log(`\n[worker] picked up ${run.id}: ${run.goal}`);
  const started = Date.now();

  await executeRun(run.id, { extraTools });

  const finished = runs.get(run.id);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`[worker] ${run.id} finished as ${finished?.status} in ${seconds}s`);
  return true;
}

async function main() {
  const reaped = runs.reapOrphans();
  if (reaped > 0) {
    console.log(`[worker] marked ${reaped} interrupted run(s) as failed.`);
  }

  extraTools = await discoverMcpTools();
  console.log(
    `[worker] ready${extraTools.length > 0 ? ` with ${extraTools.length} MCP tool(s)` : ""}. ` +
      `Waiting for tasks.`,
  );

  while (!shuttingDown) {
    let worked = false;
    try {
      worked = await tick();
    } catch (err) {
      // executeRun already records failures against the run; anything landing
      // here is a defect in the worker itself, and it must not stop the loop.
      console.error("[worker] unexpected error:", err);
    }
    if (!worked) await new Promise((r) => setTimeout(r, POLL_MS));
  }

  await shutdownMcpClients();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (shuttingDown) process.exit(1);
    console.log(`\n[worker] ${signal} received, finishing the current run then exiting.`);
    shuttingDown = true;
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
