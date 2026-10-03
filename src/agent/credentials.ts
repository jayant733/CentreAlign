import { config } from "./config";

/**
 * A stand-in for a credential store.
 *
 * Credentials are declared here and rendered into the system prompt, rather
 * than being hardcoded in prompts scattered across the codebase. In a real
 * deployment this module would front a secrets manager and hand the agent
 * short-lived references instead of plaintext — the point of isolating it now
 * is that swapping the mechanism touches one file.
 *
 * Everything here is sandbox-only and fake.
 */

export interface CredentialEntry {
  system: string;
  loginUrl: string;
  username: string;
  password: string;
  note?: string;
}

export function availableCredentials(): CredentialEntry[] {
  return [
    {
      system: "Northwind Vendor Invoice Portal",
      loginUrl: "/sandbox/portal/login",
      username: config.sandbox.portalUser,
      password: config.sandbox.portalPassword,
      note: "Accounts-payable clerk account. Read-only access to supplier invoices.",
    },
  ];
}

export function renderCredentials(): string {
  const entries = availableCredentials();
  if (entries.length === 0) return "No credentials are available to you.";

  return entries
    .map(
      (c) =>
        `- ${c.system}\n` +
        `  login page: ${c.loginUrl}\n` +
        `  username: ${c.username}\n` +
        `  password: ${c.password}` +
        (c.note ? `\n  note: ${c.note}` : ""),
    )
    .join("\n");
}
