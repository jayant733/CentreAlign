import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { config } from "../config";
import type { ToolDefinition, ToolResult } from "../types";

/**
 * Praxis as an MCP *client*.
 *
 * At startup the agent connects to whatever MCP servers are configured, lists
 * their tools, and wraps each one as an ordinary ToolDefinition. From that
 * point on nothing distinguishes them from built-in tools: the planner sees
 * them, the model can call them, the approval gate applies to them, and the
 * trace records them the same way.
 *
 * This is the main answer to "how much of the system survives a different
 * task". Giving the agent a new capability — a ticketing system, a CRM, a
 * spreadsheet — becomes a line of configuration rather than a code change,
 * because the loop was never written against any particular tool.
 */

const ServerConfigSchema = z.union([
  z.object({
    type: z.literal("stdio").optional(),
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    /** Tools from this server that require human approval before running. */
    dangerousTools: z.array(z.string()).optional(),
    disabled: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("http"),
    url: z.string(),
    headers: z.record(z.string(), z.string()).optional(),
    dangerousTools: z.array(z.string()).optional(),
    disabled: z.boolean().optional(),
  }),
]);

const McpConfigSchema = z.object({
  servers: z.record(z.string(), ServerConfigSchema).default({}),
});

export const MCP_CONFIG_PATH = path.join(config.root, "mcp.config.json");

const connected: Client[] = [];

function loadConfig(): z.infer<typeof McpConfigSchema> | null {
  if (!fs.existsSync(MCP_CONFIG_PATH)) return null;
  try {
    const parsed = McpConfigSchema.safeParse(JSON.parse(fs.readFileSync(MCP_CONFIG_PATH, "utf8")));
    if (!parsed.success) {
      console.warn(`[mcp] ${MCP_CONFIG_PATH} is not valid: ${parsed.error.message}`);
      return null;
    }
    return parsed.data;
  } catch (err) {
    console.warn(`[mcp] could not read ${MCP_CONFIG_PATH}: ${String(err)}`);
    return null;
  }
}

function textOf(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content ?? [];
  const parts = content
    .map((c) => (c.type === "text" ? (c.text ?? "") : `[${c.type} content]`))
    .filter(Boolean);
  return parts.join("\n").trim() || "(the tool returned no content)";
}

/**
 * Connects to every configured server and returns their tools.
 *
 * A server that fails to start is logged and skipped rather than aborting the
 * run: a missing optional integration should degrade the agent's capabilities,
 * not prevent it from working at all.
 */
export async function discoverMcpTools(): Promise<ToolDefinition[]> {
  const cfg = loadConfig();
  if (!cfg) return [];

  const tools: ToolDefinition[] = [];

  for (const [name, server] of Object.entries(cfg.servers)) {
    if (server.disabled) continue;

    try {
      const client = new Client({ name: "praxis", version: "0.1.0" });
      const transport =
        "url" in server
          ? new StreamableHTTPClientTransport(new URL(server.url), {
              requestInit: { headers: server.headers },
            })
          : new StdioClientTransport({
              command: server.command,
              args: server.args ?? [],
              env: { ...(process.env as Record<string, string>), ...(server.env ?? {}) },
            });

      await client.connect(transport);
      connected.push(client);

      const listed = await client.listTools();
      const dangerous = new Set(server.dangerousTools ?? []);

      for (const tool of listed.tools) {
        const schema = (tool.inputSchema ?? { type: "object", properties: {} }) as Record<
          string,
          unknown
        >;

        tools.push({
          // Namespaced so two servers exposing `search` cannot collide.
          name: `${name}__${tool.name}`,
          description: `${tool.description ?? tool.name} (provided by the "${name}" MCP server)`,
          // The server owns the real schema; validate permissively here and let
          // the server reject what it does not like.
          parameters: z.record(z.string(), z.unknown()),
          rawJsonSchema: schema,
          risk: dangerous.has(tool.name) ? "dangerous" : "write",
          origin: { kind: "mcp", server: name },
          async run(args): Promise<ToolResult> {
            const response = await client.callTool({
              name: tool.name,
              arguments: (args ?? {}) as Record<string, unknown>,
            });
            const observation = textOf(response);
            const failed = (response as { isError?: boolean }).isError === true;

            return {
              ok: !failed,
              observation,
              data: response,
              error: failed
                ? { kind: "unknown", message: observation.slice(0, 300), retryable: false }
                : undefined,
            };
          },
        });
      }

      console.log(`[mcp] "${name}" connected, ${listed.tools.length} tool(s) available.`);
    } catch (err) {
      console.warn(
        `[mcp] "${name}" could not be reached and will be skipped: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  return tools;
}

export async function shutdownMcpClients(): Promise<void> {
  await Promise.all(connected.map((c) => c.close().catch(() => {})));
  connected.length = 0;
}
