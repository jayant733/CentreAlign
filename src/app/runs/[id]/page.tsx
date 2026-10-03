import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { artifacts, events, interventions, memory, runs, steps } from "@/agent/db";
import { RunView } from "@/components/run/RunView";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const run = runs.get(id);
  return { title: run ? `Case ${id} — Praxis` : "Case not found — Praxis" };
}

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = runs.get(id);
  if (!run) notFound();

  return (
    <RunView
      initial={{
        run,
        steps: steps.list(id),
        facts: memory.all(id),
        artifacts: artifacts.forRun(id),
        pending: interventions.pendingForRun(id),
        events: events.list(id, 0, 2000),
      }}
    />
  );
}
