import { NextResponse } from "next/server";
import { artifacts, events, interventions, memory, runs, steps } from "@/agent/db";

export const runtime = "nodejs";

/** Everything the UI needs to render a run in one request. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = runs.get(id);
  if (!run) return NextResponse.json({ error: "No such run." }, { status: 404 });

  return NextResponse.json({
    run,
    steps: steps.list(id),
    facts: memory.all(id),
    artifacts: artifacts.forRun(id),
    pending: interventions.pendingForRun(id),
    events: events.list(id, 0, 1000),
  });
}

/** Cancels a run. The worker notices on its next poll. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = runs.get(id);
  if (!run) return NextResponse.json({ error: "No such run." }, { status: 404 });

  runs.setStatus(id, "cancelled");
  for (const pending of interventions.pendingForRun(id)) interventions.expire(pending.id);
  events.append(id, { type: "run.status", level: "warn", message: "Cancelled by the user." });

  return NextResponse.json({ run: runs.get(id) });
}
