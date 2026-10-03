import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import type {
  Artifact,
  EventRecord,
  InterventionKind,
  InterventionRecord,
  InterventionStatus,
  MemoryFact,
  NewEvent,
  PlanStep,
  Recipe,
  RunRecord,
  RunStatus,
  StepRecord,
  StepStatus,
  TaskPlan,
  Verdict,
} from "./types";

/**
 * Agent state lives in SQLite rather than memory for two reasons: the HTTP API
 * and the worker are separate processes and need a shared source of truth, and
 * a run that crashes mid-flight should still be inspectable afterwards.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS runs (
  id            TEXT PRIMARY KEY,
  goal          TEXT NOT NULL,
  status        TEXT NOT NULL,
  plan          TEXT,
  summary       TEXT,
  verdict       TEXT,
  error         TEXT,
  actions_used  INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS steps (
  run_id            TEXT NOT NULL,
  step_id           TEXT NOT NULL,
  seq               INTEGER NOT NULL,
  title             TEXT NOT NULL,
  intent            TEXT NOT NULL,
  success_criterion TEXT NOT NULL,
  depends_on        TEXT NOT NULL,
  status            TEXT NOT NULL,
  attempts          INTEGER NOT NULL DEFAULT 0,
  outcome           TEXT,
  PRIMARY KEY (run_id, step_id)
);

CREATE TABLE IF NOT EXISTS events (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id   TEXT NOT NULL,
  ts       INTEGER NOT NULL,
  type     TEXT NOT NULL,
  step_id  TEXT,
  level    TEXT NOT NULL DEFAULT 'info',
  message  TEXT NOT NULL,
  data     TEXT
);
CREATE INDEX IF NOT EXISTS events_run_idx ON events (run_id, id);

CREATE TABLE IF NOT EXISTS memory (
  run_id     TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  source     TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, key)
);

CREATE TABLE IF NOT EXISTS recipes (
  id         TEXT PRIMARY KEY,
  scope      TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  uses       INTEGER NOT NULL DEFAULT 0,
  successes  INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS recipes_scope_idx ON recipes (scope);

CREATE TABLE IF NOT EXISTS interventions (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL,
  kind        TEXT NOT NULL,
  status      TEXT NOT NULL,
  prompt      TEXT NOT NULL,
  tool        TEXT,
  args        TEXT,
  options     TEXT,
  response    TEXT,
  created_at  INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE INDEX IF NOT EXISTS interventions_run_idx ON interventions (run_id, status);

CREATE TABLE IF NOT EXISTS artifacts (
  id      TEXT PRIMARY KEY,
  run_id  TEXT NOT NULL,
  kind    TEXT NOT NULL,
  label   TEXT NOT NULL,
  url     TEXT,
  path    TEXT,
  ts      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS artifacts_run_idx ON artifacts (run_id, ts);
`;

function openDatabase(): DatabaseSync {
  fs.mkdirSync(path.dirname(config.agentDbPath), { recursive: true });
  const db = new DatabaseSync(config.agentDbPath);
  // WAL lets the Next.js process read while the worker writes.
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

// Next.js hot-reloads modules in dev; without this each reload would open a
// fresh handle and leak them.
const globalRef = globalThis as unknown as { __praxisDb?: DatabaseSync };
export const db: DatabaseSync = globalRef.__praxisDb ?? (globalRef.__praxisDb = openDatabase());

const now = () => Date.now();
const json = (v: unknown) => (v === undefined || v === null ? null : JSON.stringify(v));
function parse<T>(v: unknown, fallback: T): T {
  if (typeof v !== "string" || v === "") return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

/* -------------------------------------------------------------------------- */
/* Runs                                                                       */
/* -------------------------------------------------------------------------- */

type RunRow = Record<string, unknown>;

function toRun(row: RunRow): RunRecord {
  return {
    id: String(row.id),
    goal: String(row.goal),
    status: String(row.status) as RunStatus,
    plan: parse<TaskPlan | null>(row.plan, null),
    summary: (row.summary as string | null) ?? null,
    verdict: parse<Verdict | null>(row.verdict, null),
    error: (row.error as string | null) ?? null,
    actionsUsed: Number(row.actions_used ?? 0),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export const runs = {
  create(id: string, goal: string): RunRecord {
    const ts = now();
    db.prepare(
      `INSERT INTO runs (id, goal, status, actions_used, created_at, updated_at)
       VALUES (?, ?, 'queued', 0, ?, ?)`,
    ).run(id, goal, ts, ts);
    return runs.get(id)!;
  },

  get(id: string): RunRecord | null {
    const row = db.prepare(`SELECT * FROM runs WHERE id = ?`).get(id) as RunRow | undefined;
    return row ? toRun(row) : null;
  },

  list(limit = 50): RunRecord[] {
    const rows = db
      .prepare(`SELECT * FROM runs ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as RunRow[];
    return rows.map(toRun);
  },

  /** Atomically claim one queued run, so multiple workers cannot double-run. */
  claimNextQueued(): RunRecord | null {
    const row = db
      .prepare(`SELECT id FROM runs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`)
      .get() as RunRow | undefined;
    if (!row) return null;
    const changed = db
      .prepare(`UPDATE runs SET status = 'planning', updated_at = ? WHERE id = ? AND status = 'queued'`)
      .run(now(), String(row.id));
    if (changed.changes === 0) return null;
    return runs.get(String(row.id));
  },

  setStatus(id: string, status: RunStatus): void {
    db.prepare(`UPDATE runs SET status = ?, updated_at = ? WHERE id = ?`).run(status, now(), id);
  },

  setPlan(id: string, plan: TaskPlan): void {
    db.prepare(`UPDATE runs SET plan = ?, updated_at = ? WHERE id = ?`).run(json(plan), now(), id);
  },

  finish(
    id: string,
    status: RunStatus,
    fields: { summary?: string | null; verdict?: Verdict | null; error?: string | null },
  ): void {
    db.prepare(
      `UPDATE runs SET status = ?, summary = ?, verdict = ?, error = ?, updated_at = ? WHERE id = ?`,
    ).run(
      status,
      fields.summary ?? null,
      json(fields.verdict ?? null),
      fields.error ?? null,
      now(),
      id,
    );
  },

  /** Returns the new total so the loop can enforce the global action budget. */
  bumpActions(id: string): number {
    db.prepare(`UPDATE runs SET actions_used = actions_used + 1, updated_at = ? WHERE id = ?`).run(
      now(),
      id,
    );
    const row = db.prepare(`SELECT actions_used FROM runs WHERE id = ?`).get(id) as RunRow;
    return Number(row?.actions_used ?? 0);
  },

  /** On worker startup, any run left mid-flight by a crash is not recoverable
   *  in-place, so mark it failed instead of leaving a zombie in the UI. */
  reapOrphans(): number {
    const res = db
      .prepare(
        `UPDATE runs SET status = 'failed',
                         error = COALESCE(error, 'Worker restarted while this run was in flight.'),
                         updated_at = ?
         WHERE status IN ('planning','running','verifying','awaiting_human')`,
      )
      .run(now());
    return res.changes as number;
  },
};

/* -------------------------------------------------------------------------- */
/* Steps                                                                      */
/* -------------------------------------------------------------------------- */

function toStep(row: RunRow): StepRecord {
  return {
    runId: String(row.run_id),
    stepId: String(row.step_id),
    title: String(row.title),
    intent: String(row.intent),
    successCriterion: String(row.success_criterion),
    dependsOn: parse<string[]>(row.depends_on, []),
    status: String(row.status) as StepStatus,
    attempts: Number(row.attempts ?? 0),
    outcome: (row.outcome as string | null) ?? null,
  };
}

export const steps = {
  /** Replaces the whole step set. Used by both initial planning and replans;
   *  steps that already passed keep their status so work is not redone. */
  replaceAll(runId: string, plan: PlanStep[]): void {
    const existing = new Map(steps.list(runId).map((s) => [s.stepId, s]));
    db.prepare(`DELETE FROM steps WHERE run_id = ?`).run(runId);
    const insert = db.prepare(
      `INSERT INTO steps (run_id, step_id, seq, title, intent, success_criterion,
                          depends_on, status, attempts, outcome)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    plan.forEach((s, i) => {
      const prior = existing.get(s.id);
      const keep = prior?.status === "passed";
      insert.run(
        runId,
        s.id,
        i,
        s.title,
        s.intent,
        s.successCriterion,
        json(s.dependsOn) ?? "[]",
        keep ? "passed" : "pending",
        keep ? prior!.attempts : 0,
        keep ? prior!.outcome : null,
      );
    });
  },

  list(runId: string): StepRecord[] {
    const rows = db
      .prepare(`SELECT * FROM steps WHERE run_id = ? ORDER BY seq ASC`)
      .all(runId) as RunRow[];
    return rows.map(toStep);
  },

  setStatus(runId: string, stepId: string, status: StepStatus, outcome?: string | null): void {
    db.prepare(`UPDATE steps SET status = ?, outcome = ? WHERE run_id = ? AND step_id = ?`).run(
      status,
      outcome ?? null,
      runId,
      stepId,
    );
  },

  bumpAttempts(runId: string, stepId: string): number {
    db.prepare(`UPDATE steps SET attempts = attempts + 1 WHERE run_id = ? AND step_id = ?`).run(
      runId,
      stepId,
    );
    const row = db
      .prepare(`SELECT attempts FROM steps WHERE run_id = ? AND step_id = ?`)
      .get(runId, stepId) as RunRow;
    return Number(row?.attempts ?? 0);
  },
};

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

export const events = {
  append(runId: string, e: NewEvent): EventRecord {
    const ts = now();
    const res = db
      .prepare(
        `INSERT INTO events (run_id, ts, type, step_id, level, message, data)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(runId, ts, e.type, e.stepId ?? null, e.level ?? "info", e.message, json(e.data));
    return { ...e, id: Number(res.lastInsertRowid), runId, ts };
  },

  /** `afterId` makes the SSE endpoint a simple cursor tail. */
  list(runId: string, afterId = 0, limit = 500): EventRecord[] {
    const rows = db
      .prepare(`SELECT * FROM events WHERE run_id = ? AND id > ? ORDER BY id ASC LIMIT ?`)
      .all(runId, afterId, limit) as RunRow[];
    return rows.map((row) => ({
      id: Number(row.id),
      runId: String(row.run_id),
      ts: Number(row.ts),
      type: String(row.type) as EventRecord["type"],
      stepId: (row.step_id as string | null) ?? null,
      level: String(row.level ?? "info") as EventRecord["level"],
      message: String(row.message),
      data: parse<unknown>(row.data, null),
    }));
  },
};

/* -------------------------------------------------------------------------- */
/* Memory                                                                     */
/* -------------------------------------------------------------------------- */

export const memory = {
  write(runId: string, key: string, value: string, source?: string): void {
    db.prepare(
      `INSERT INTO memory (run_id, key, value, source, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(run_id, key) DO UPDATE SET value = excluded.value,
                                              source = excluded.source,
                                              updated_at = excluded.updated_at`,
    ).run(runId, key, value, source ?? null, now());
  },

  read(runId: string, key: string): string | undefined {
    const row = db
      .prepare(`SELECT value FROM memory WHERE run_id = ? AND key = ?`)
      .get(runId, key) as RunRow | undefined;
    return row ? String(row.value) : undefined;
  },

  all(runId: string): MemoryFact[] {
    const rows = db
      .prepare(`SELECT key, value, source FROM memory WHERE run_id = ? ORDER BY updated_at ASC`)
      .all(runId) as RunRow[];
    return rows.map((r) => ({
      key: String(r.key),
      value: String(r.value),
      source: (r.source as string | null) ?? undefined,
    }));
  },
};

/* -------------------------------------------------------------------------- */
/* Recipes (cross-run semantic memory)                                        */
/* -------------------------------------------------------------------------- */

function toRecipe(row: RunRow): Recipe {
  return {
    id: String(row.id),
    scope: String(row.scope),
    title: String(row.title),
    body: String(row.body),
    uses: Number(row.uses ?? 0),
    successes: Number(row.successes ?? 0),
    updatedAt: Number(row.updated_at),
  };
}

export const recipes = {
  /** Keyed on scope+title so repeated runs sharpen one recipe rather than
   *  accumulating near-duplicates. */
  upsert(scope: string, title: string, body: string): void {
    const id = `${scope}::${title}`.toLowerCase().replace(/[^a-z0-9:]+/g, "-");
    db.prepare(
      `INSERT INTO recipes (id, scope, title, body, uses, successes, updated_at)
       VALUES (?, ?, ?, ?, 0, 0, ?)
       ON CONFLICT(id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
    ).run(id, scope, title, body, now());
  },

  forScope(scope: string, limit = 8): Recipe[] {
    const rows = db
      .prepare(
        `SELECT * FROM recipes WHERE ? LIKE '%' || scope || '%'
         ORDER BY successes DESC, updated_at DESC LIMIT ?`,
      )
      .all(scope, limit) as RunRow[];
    return rows.map(toRecipe);
  },

  all(): Recipe[] {
    return (db.prepare(`SELECT * FROM recipes ORDER BY updated_at DESC`).all() as RunRow[]).map(
      toRecipe,
    );
  },

  recordUse(id: string, succeeded: boolean): void {
    db.prepare(
      `UPDATE recipes SET uses = uses + 1, successes = successes + ?, updated_at = ? WHERE id = ?`,
    ).run(succeeded ? 1 : 0, now(), id);
  },
};

/* -------------------------------------------------------------------------- */
/* Interventions (approvals and questions)                                    */
/* -------------------------------------------------------------------------- */

function toIntervention(row: RunRow): InterventionRecord {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    kind: String(row.kind) as InterventionKind,
    status: String(row.status) as InterventionStatus,
    prompt: String(row.prompt),
    tool: (row.tool as string | null) ?? null,
    args: parse<Record<string, unknown> | null>(row.args, null),
    options: parse<string[] | null>(row.options, null),
    response: (row.response as string | null) ?? null,
    createdAt: Number(row.created_at),
    resolvedAt: row.resolved_at === null ? null : Number(row.resolved_at),
  };
}

export const interventions = {
  create(input: {
    id: string;
    runId: string;
    kind: InterventionKind;
    prompt: string;
    tool?: string | null;
    args?: Record<string, unknown> | null;
    options?: string[] | null;
  }): InterventionRecord {
    db.prepare(
      `INSERT INTO interventions (id, run_id, kind, status, prompt, tool, args, options, created_at)
       VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
    ).run(
      input.id,
      input.runId,
      input.kind,
      input.prompt,
      input.tool ?? null,
      json(input.args ?? null),
      json(input.options ?? null),
      now(),
    );
    return interventions.get(input.id)!;
  },

  get(id: string): InterventionRecord | null {
    const row = db.prepare(`SELECT * FROM interventions WHERE id = ?`).get(id) as RunRow | undefined;
    return row ? toIntervention(row) : null;
  },

  pendingForRun(runId: string): InterventionRecord[] {
    const rows = db
      .prepare(`SELECT * FROM interventions WHERE run_id = ? AND status = 'pending' ORDER BY created_at`)
      .all(runId) as RunRow[];
    return rows.map(toIntervention);
  },

  resolve(id: string, response: string): InterventionRecord | null {
    db.prepare(
      `UPDATE interventions SET status = 'resolved', response = ?, resolved_at = ?
       WHERE id = ? AND status = 'pending'`,
    ).run(response, now(), id);
    return interventions.get(id);
  },

  expire(id: string): void {
    db.prepare(
      `UPDATE interventions SET status = 'expired', resolved_at = ? WHERE id = ? AND status = 'pending'`,
    ).run(now(), id);
  },
};

/* -------------------------------------------------------------------------- */
/* Artifacts                                                                  */
/* -------------------------------------------------------------------------- */

export const artifacts = {
  add(runId: string, a: Artifact): void {
    db.prepare(
      `INSERT OR REPLACE INTO artifacts (id, run_id, kind, label, url, path, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(a.id, runId, a.kind, a.label, a.url ?? null, a.path ?? null, now());
  },

  forRun(runId: string): Artifact[] {
    const rows = db
      .prepare(`SELECT * FROM artifacts WHERE run_id = ? ORDER BY ts ASC`)
      .all(runId) as RunRow[];
    return rows.map((r) => ({
      id: String(r.id),
      kind: String(r.kind) as Artifact["kind"],
      label: String(r.label),
      url: (r.url as string | null) ?? undefined,
      path: (r.path as string | null) ?? undefined,
    }));
  },
};
