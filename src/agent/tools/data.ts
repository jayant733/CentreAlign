import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { config, resolveTarget } from "../config";
import type { ToolDefinition, ToolResult } from "../types";

/** Keeps file tools inside the sandboxed workspace, whatever the model asks for. */
function resolveInWorkspace(name: string): string | null {
  const cleaned = name.replace(/^[/\\]+/, "");
  const full = path.resolve(config.workspaceDir, cleaned);
  const root = path.resolve(config.workspaceDir);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

/**
 * pdfjs hands back a flat list of positioned text fragments with no notion of
 * lines. Re-grouping them by vertical position is what turns
 *
 *   "Subtotal" "$17,012.00" "TOTAL DUE" "$18,415.49 USD"
 *
 * into labelled lines the model can read without guessing which number
 * belongs to which label. Without this step an agent reliably picks the wrong
 * figure off an invoice.
 */
async function extractPdfLines(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;

  const out: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    const rows = new Map<number, Array<{ x: number; s: string }>>();
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      if (!item.str || !item.str.trim()) continue;
      const x = item.transform[4];
      const y = Math.round(item.transform[5] / 2) * 2; // tolerate sub-pixel drift
      const row = rows.get(y) ?? [];
      row.push({ x, s: item.str });
      rows.set(y, row);
    }

    if (doc.numPages > 1) out.push(`--- page ${p} of ${doc.numPages} ---`);
    for (const y of [...rows.keys()].sort((a, b) => b - a)) {
      const line = rows
        .get(y)!
        .sort((a, b) => a.x - b.x)
        .map((i) => i.s)
        .join("  ")
        .replace(/\s{3,}/g, "   ")
        .trim();
      if (line) out.push(line);
    }
  }

  return { text: out.join("\n"), pages: doc.numPages };
}

export const dataTools: ToolDefinition[] = [
  {
    name: "read_pdf",
    description:
      "Download a PDF and return its text content, laid out line by line. The request reuses the " +
      "browser's cookies, so it works for documents behind a login the browser has already " +
      "completed. Use this whenever a figure you need lives in a document rather than on a page.",
    risk: "safe",
    parameters: z.object({
      url: z.string().min(1).describe("URL or path of the PDF"),
    }),
    async run({ url }, ctx): Promise<ToolResult> {
      const page = await ctx.browser.page();
      const target = resolveTarget(url);

      const response = await page.context().request.get(target, { timeout: 20_000 });
      const status = response.status();

      if (status >= 400) {
        const body = (await response.text().catch(() => "")).slice(0, 400);
        return {
          ok: false,
          observation:
            `Downloading ${target} failed with HTTP ${status}. The server said: "${body.trim()}"`,
          error: {
            kind: status >= 500 ? "server_error" : status === 404 ? "not_found" : "auth",
            message: `HTTP ${status}: ${body.trim()}`,
            // A 5xx on a document service is exactly the case where trying the
            // identical request again is the correct move.
            retryable: status >= 500 || status === 429,
          },
        };
      }

      const buffer = await response.body();
      const contentType = response.headers()["content-type"] ?? "";
      if (!contentType.includes("pdf") && buffer.subarray(0, 4).toString() !== "%PDF") {
        return {
          ok: false,
          observation:
            `${target} did not return a PDF (content-type: ${contentType || "unknown"}). ` +
            `Check the URL points at a document.`,
          error: { kind: "bad_args", message: `Not a PDF: ${contentType}`, retryable: false },
        };
      }

      const saved = ctx.saveArtifact("file", `PDF ${path.basename(target)}`, buffer, "pdf");
      const { text, pages } = await extractPdfLines(new Uint8Array(buffer));

      return {
        ok: true,
        observation:
          `Extracted text from ${target} (${pages} page${pages === 1 ? "" : "s"}).\n\n` +
          `--- document text ---\n${text}\n--- end of document ---`,
        data: { url: target, pages, text },
        artifacts: [saved],
      };
    },
  },

  {
    name: "http_request",
    description:
      "Make an HTTP request to one of the company's own APIs and return the status and body. " +
      "Useful for reading data or confirming a change without driving the UI. Requests are " +
      "restricted to internal company hosts. If an API refuses the operation, read the error " +
      "message: it usually says which route is permitted instead.",
    risk: "write",
    parameters: z.object({
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
      url: z.string().min(1),
      body: z.string().optional().describe("JSON string for the request body"),
      headers: z.record(z.string(), z.string()).optional(),
    }),
    async run({ method, url, body, headers }): Promise<ToolResult> {
      const target = resolveTarget(url);

      // Allowlist. The agent operates on internal systems only; it has no
      // business reaching the public internet, and saying so explicitly is
      // cheaper than hoping the prompt holds.
      const allowed = new URL(config.baseUrl).origin;
      if (new URL(target).origin !== allowed) {
        return {
          ok: false,
          observation:
            `Requests to ${new URL(target).origin} are not permitted. This agent may only call ` +
            `internal company APIs at ${allowed}.`,
          error: { kind: "blocked", message: "Host not allowed", retryable: false },
        };
      }

      const res = await fetch(target, {
        method,
        headers: { "content-type": "application/json", ...(headers ?? {}) },
        body: method === "GET" || method === "DELETE" ? undefined : body,
      });
      const text = await res.text();
      const truncated = text.length > 4000 ? `${text.slice(0, 4000)}…[truncated]` : text;

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }

      return {
        ok: res.ok,
        observation: `${method} ${target} → HTTP ${res.status}\n\n${truncated}`,
        data: { status: res.status, body: parsed ?? truncated },
        error: res.ok
          ? undefined
          : {
              kind: res.status >= 500 ? "server_error" : res.status === 404 ? "not_found" : "auth",
              message: `HTTP ${res.status}: ${truncated.slice(0, 300)}`,
              retryable: res.status >= 500 || res.status === 429,
            },
      };
    },
  },

  {
    name: "write_file",
    description:
      "Write a text file into the agent's workspace, for example a CSV or a report you were " +
      "asked to produce. The file becomes part of the evidence attached to the run.",
    risk: "write",
    parameters: z.object({
      filename: z.string().min(1).describe("File name, e.g. september-invoices.csv"),
      content: z.string(),
    }),
    async run({ filename, content }, ctx): Promise<ToolResult> {
      const full = resolveInWorkspace(filename);
      if (!full) {
        return {
          ok: false,
          observation: `"${filename}" resolves outside the workspace. Use a plain file name.`,
          error: { kind: "blocked", message: "Path escapes workspace", retryable: false },
        };
      }

      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, "utf8");
      const saved = ctx.saveArtifact("file", filename, content, path.extname(filename).slice(1) || "txt");

      const lines = content.split("\n").length;
      return {
        ok: true,
        observation: `Wrote ${filename} (${lines} lines, ${content.length} characters) to the workspace.`,
        data: { filename, bytes: content.length, lines },
        artifacts: [saved],
      };
    },
  },

  {
    name: "read_file",
    description: "Read back a text file from the agent's workspace.",
    risk: "safe",
    parameters: z.object({ filename: z.string().min(1) }),
    async run({ filename }): Promise<ToolResult> {
      const full = resolveInWorkspace(filename);
      if (!full || !fs.existsSync(full)) {
        const available = fs.existsSync(config.workspaceDir)
          ? fs.readdirSync(config.workspaceDir).join(", ") || "(empty)"
          : "(empty)";
        return {
          ok: false,
          observation: `No file named "${filename}" in the workspace. Files present: ${available}.`,
          error: { kind: "not_found", message: `Missing ${filename}`, retryable: false },
        };
      }
      const content = fs.readFileSync(full, "utf8");
      return {
        ok: true,
        observation: `Contents of ${filename}:\n\n${content.slice(0, 4000)}`,
        data: { filename, content },
      };
    },
  },
];
