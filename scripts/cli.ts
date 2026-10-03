import { nanoid } from "nanoid";
import { runs, memory, artifacts, steps } from "@/agent/db";
import { CliHumanGateway } from "@/agent/human";
import { executeRun } from "@/agent/loop";
import { discoverMcpTools, shutdownMcpClients } from "@/agent/mcp/client";
import type { NewEvent } from "@/agent/types";

/**
 * Runs one task from the terminal, with the human-in-the-loop prompts answered
 * on stdin. Useful for development and for the eval harness; the web UI uses
 * the same `executeRun` through the worker.
 */

const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";

function print(e: NewEvent) {
  const colour = e.level === "error" ? RED : e.level === "warn" ? YELLOW : "";
  switch (e.type) {
    case "plan.created":
    case "plan.revised": {
      const plan = e.data as { steps: Array<{ id: string; title: string; successCriterion: string }> };
      console.log(`\n${BOLD}${CYAN}PLAN${RESET}`);
      for (const s of plan.steps) {
        console.log(`  ${BOLD}${s.id}${RESET} ${s.title}`);
        console.log(`     ${DIM}done when: ${s.successCriterion}${RESET}`);
      }
      console.log("");
      break;
    }
    case "step.started":
      console.log(`\n${BOLD}▸ ${e.stepId}: ${e.message}${RESET}`);
      break;
    case "action.proposed":
      console.log(`  ${DIM}↳ ${e.message}${RESET}`);
      break;
    case "action.result": {
      const d = e.data as { tool: string; ok: boolean };
      console.log(`    ${colour}${d.ok ? "·" : "✗"} ${d.tool}${RESET}${colour ? ` ${e.message}${RESET}` : ""}`);
      break;
    }
    case "memory.written":
      console.log(`    ${GREEN}✎ ${e.message}${RESET}`);
      break;
    case "critique":
      console.log(`  ${colour || CYAN}⊙ ${e.message}${RESET}`);
      break;
    case "step.finished":
      console.log(`  ${colour || GREEN}${e.message}${RESET}`);
      break;
    case "verification.finished":
      console.log(`\n${BOLD}${colour || GREEN}VERIFICATION${RESET} ${e.message}`);
      break;
    case "run.finished":
      break;
    default:
      if (e.message) console.log(`  ${DIM}${e.message}${RESET}`);
  }
}

async function main() {
  const goal = process.argv.slice(2).join(" ").trim();
  if (!goal) {
    console.error(`Usage: npm run task -- "<what you want done>"\n`);
    console.error(`Example:`);
    console.error(
      `  npm run task -- "Find the latest invoice from Acme, get the total and due date, and enter it into NimbusERP"`,
    );
    process.exit(1);
  }

  const extraTools = await discoverMcpTools();
  if (extraTools.length > 0) {
    console.log(`${DIM}Loaded ${extraTools.length} tool(s) from MCP servers.${RESET}`);
  }

  const runId = nanoid(10);
  runs.create(runId, goal);
  console.log(`${BOLD}Praxis${RESET} ${DIM}run ${runId}${RESET}`);
  console.log(`${DIM}goal:${RESET} ${goal}`);

  await executeRun(runId, {
    human: new CliHumanGateway(),
    extraTools,
    onEvent: print,
  });

  const final = runs.get(runId)!;
  const ok = final.status === "succeeded";

  console.log(`\n${BOLD}${ok ? GREEN : RED}${ok ? "COMPLETED" : "NOT COMPLETED"}${RESET}`);
  console.log(`\n${final.summary ?? final.error ?? "(no summary)"}\n`);

  if (final.verdict) {
    console.log(`${BOLD}Checks${RESET}`);
    for (const check of final.verdict.checks) {
      console.log(`  ${check.passed ? `${GREEN}✓` : `${RED}✗`}${RESET} ${check.description}`);
      console.log(`     ${DIM}${check.evidence}${RESET}`);
    }
  }

  const facts = memory.all(runId);
  if (facts.length > 0) {
    console.log(`\n${BOLD}What it recorded${RESET}`);
    for (const f of facts) console.log(`  ${f.key} = ${f.value}  ${DIM}(${f.source ?? ""})${RESET}`);
  }

  const evidence = artifacts.forRun(runId);
  console.log(
    `\n${DIM}${steps.list(runId).filter((s) => s.status === "passed").length}/${
      steps.list(runId).length
    } steps passed · ${final.actionsUsed} actions · ${evidence.length} artifacts${RESET}`,
  );
  console.log(`${DIM}Full trace: ${process.env.PRAXIS_BASE_URL ?? "http://localhost:3000"}/runs/${runId}${RESET}\n`);

  await shutdownMcpClients();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
