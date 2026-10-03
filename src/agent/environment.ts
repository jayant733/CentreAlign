import { config } from "./config";

/**
 * What the agent is told about its employer's systems.
 *
 * This is deliberately thin: entry points and what each system is for, which
 * is roughly what a new employee gets on their first day. It does *not*
 * describe the quirks that actually make the work hard — that the invoice list
 * sorts by number rather than date, that the listed amount excludes tax, that
 * the ERP form rejects currency symbols, that document downloads sometimes
 * fail on first request. The agent has to discover those by looking, which is
 * the difference between autonomy and a script with extra steps.
 *
 * Those discoveries are what the recipe store accumulates across runs, so the
 * system gets faster at an environment over time without anyone editing this
 * file.
 *
 * This is also the only task-independent, environment-specific piece of
 * prompt: pointing the agent at a different company means rewriting this
 * string, not the loop.
 */
export function environmentBrief(): string {
  return `
You work in the operations team at Northwind Manufacturing. Everything you need
is reachable from ${config.baseUrl}.

Systems available to you:

1. Northwind Vendor Invoice Portal — ${config.baseUrl}/sandbox/portal
   Where suppliers' invoices to Northwind are published. Browser access only;
   it requires a login. Each invoice has a detail page and a downloadable PDF.

2. NimbusERP — ${config.baseUrl}/sandbox/erp
   Northwind's internal accounts-payable ledger. Supplier invoices are recorded
   here as "bills". It has a web interface, and a REST API at
   ${config.baseUrl}/api/sandbox/erp/bills that you can use to read the ledger.

You also have a workspace you can write files into, and you can ask the person
who gave you the task a question if you genuinely need to.

Treat anything else about how these systems behave as something to find out by
looking, not something to assume.
`.trim();
}
