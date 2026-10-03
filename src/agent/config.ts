import path from "node:path";

function str(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

const root = process.cwd();
const dataDir = path.join(root, ".data");

export const config = {
  /** Repo root. All sandboxed file access is resolved relative to this. */
  root,
  dataDir,

  /** Agent state: runs, events, steps, memory, approvals. */
  agentDbPath: path.join(dataDir, "praxis.db"),
  /** The simulated company's data. Deliberately a separate database so the
   *  agent's own bookkeeping can never be confused with company records. */
  sandboxDbPath: path.join(dataDir, "sandbox.db"),

  /** Screenshots and downloads land under /public so the UI can show them. */
  artifactsDir: path.join(root, "public", "artifacts"),
  artifactsUrlBase: "/artifacts",
  /** The only directory file tools may touch. */
  workspaceDir: path.join(dataDir, "workspace"),

  llm: {
    apiKey: str("GEMINI_API_KEY", ""),
    model: str("PRAXIS_MODEL", "gemini-2.5-flash"),
    fastModel: str("PRAXIS_MODEL_FAST", "gemini-2.5-flash-lite"),
  },

  baseUrl: str("PRAXIS_BASE_URL", "http://localhost:3000"),

  browser: {
    headless: bool("PRAXIS_HEADLESS", false),
    viewport: { width: 1280, height: 820 },
    navigationTimeoutMs: 20_000,
    actionTimeoutMs: 10_000,
  },

  limits: {
    /** Attempts per plan step before the step is declared failed. */
    maxStepAttempts: num("PRAXIS_MAX_STEP_ATTEMPTS", 4),
    /** Total tool calls per run. A confused agent must still terminate. */
    maxRunActions: num("PRAXIS_MAX_RUN_ACTIONS", 80),
    /** Replans allowed before we give up and escalate to the human. */
    maxReplans: 3,
    /** How long a run waits for a human answer before failing safe. */
    humanTimeoutMs: 15 * 60_000,
  },

  sandbox: {
    portalUser: str("SANDBOX_PORTAL_USER", "ap.clerk@northwind.example"),
    portalPassword: str("SANDBOX_PORTAL_PASSWORD", "hunter2-sandbox"),
    /** Fraction of vendor-portal API calls that fail with a 500, so the
     *  retry machinery is exercised on every demo run rather than in theory. */
    faultRate: num("SANDBOX_FAULT_RATE", 0.25),
  },
} as const;

export function assertLlmConfigured(): void {
  if (!config.llm.apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Copy .env.example to .env and add a key " +
        "from https://aistudio.google.com/apikey",
    );
  }
}
