import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { read } from "@/agent/db-read";
import { RunView } from "@/components/run/RunView";

export const dynamic = "force-dynamic";

// generateMetadata and the page both need the case; fetch it once per request.
const load = cache((id: string) => read.snapshot(id));

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const snap = await load(id);
  return { title: snap ? `Case ${id} — Praxis` : "Case not found — Praxis" };
}

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const snap = await load(id);
  if (!snap) notFound();

  return <RunView initial={snap} />;
}
