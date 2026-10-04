import { query } from "@/db/client";
import {
  toArtifact,
  toEvent,
  toFact,
  toIntervention,
  toRun,
  toStep,
  type RunRow,
} from "./db";
import type {
  Artifact,
  EventRecord,
  InterventionRecord,
  MemoryFact,
  RunRecord,
  StepRecord,
} from "./types";

/**
 * Read side for the web server. The synchronous repos in ./db block the event
 * loop for every round trip to Neon, which is fine in the worker and fatal in
 * a request handler: one open case page froze every other page. These fetch
 * everything a view needs in parallel and never block.
 */

export interface RunSnapshot {
  run: RunRecord;
  steps: StepRecord[];
  facts: MemoryFact[];
  artifacts: Artifact[];
  pending: InterventionRecord[];
  events: EventRecord[];
}

async function rows(sql: string, params: unknown[] = []): Promise<RunRow[]> {
  return (await query(sql, params)).rows;
}

export const read = {
  async run(id: string): Promise<RunRecord | null> {
    const [row] = await rows(`SELECT * FROM agent.runs WHERE id = ?`, [id]);
    return row ? toRun(row) : null;
  },

  async runs(limit = 50): Promise<RunRecord[]> {
    return (await rows(`SELECT * FROM agent.runs ORDER BY created_at DESC LIMIT ?`, [limit])).map(toRun);
  },

  async events(runId: string, afterId = 0, limit = 500): Promise<EventRecord[]> {
    return (
      await rows(`SELECT * FROM agent.events WHERE run_id = ? AND id > ? ORDER BY id ASC LIMIT ?`, [
        runId,
        afterId,
        limit,
      ])
    ).map(toEvent);
  },

  /** One parallel round trip for the whole case view. */
  async snapshot(id: string, eventLimit = 2000): Promise<RunSnapshot | null> {
    const [runRows, stepRows, factRows, artifactRows, pendingRows, eventRows] = await Promise.all([
      rows(`SELECT * FROM agent.runs WHERE id = ?`, [id]),
      rows(`SELECT * FROM agent.steps WHERE run_id = ? ORDER BY seq ASC`, [id]),
      rows(`SELECT key, value, source FROM agent.memory WHERE run_id = ? ORDER BY updated_at ASC`, [id]),
      rows(`SELECT * FROM agent.artifacts WHERE run_id = ? ORDER BY ts ASC`, [id]),
      rows(`SELECT * FROM agent.interventions WHERE run_id = ? AND status = 'pending' ORDER BY created_at`, [
        id,
      ]),
      rows(`SELECT * FROM agent.events WHERE run_id = ? AND id > 0 ORDER BY id ASC LIMIT ?`, [id, eventLimit]),
    ]);
    const run = runRows[0];
    if (!run) return null;
    return {
      run: toRun(run),
      steps: stepRows.map(toStep),
      facts: factRows.map(toFact),
      artifacts: artifactRows.map(toArtifact),
      pending: pendingRows.map(toIntervention),
      events: eventRows.map(toEvent),
    };
  },

  /** For the live stream: new events and the current status, together. */
  async tail(runId: string, afterId: number, limit = 200) {
    const [eventRows, runRows] = await Promise.all([
      rows(`SELECT * FROM agent.events WHERE run_id = ? AND id > ? ORDER BY id ASC LIMIT ?`, [
        runId,
        afterId,
        limit,
      ]),
      rows(`SELECT * FROM agent.runs WHERE id = ?`, [runId]),
    ]);
    return { events: eventRows.map(toEvent), run: runRows[0] ? toRun(runRows[0]) : null };
  },
};
