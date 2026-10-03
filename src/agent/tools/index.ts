import type { ToolDefinition } from "../types";
import { browserTools } from "./browser";
import { dataTools } from "./data";
import { ToolRegistry } from "./registry";
import { workflowTools } from "./workflow";

export { ToolRegistry } from "./registry";
export { FINISH_STEP, REPORT_BLOCKED } from "./workflow";

/**
 * Assembles the agent's capabilities.
 *
 * `extra` is how MCP-discovered tools arrive: they are ordinary
 * ToolDefinitions by the time they get here, so the loop, the prompt builder
 * and the approval gate treat them identically to the built-in ones.
 */
export function buildRegistry(extra: ToolDefinition[] = []): ToolRegistry {
  return new ToolRegistry()
    .registerAll(browserTools)
    .registerAll(dataTools)
    .registerAll(workflowTools)
    .registerAll(extra);
}
