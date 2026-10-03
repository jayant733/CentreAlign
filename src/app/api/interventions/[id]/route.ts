import { NextResponse } from "next/server";
import { z } from "zod";
import { events, interventions } from "@/agent/db";

export const runtime = "nodejs";

const Body = z.object({
  response: z.string().trim().min(1, "Write a reply first.").max(2000),
});

/**
 * Answers a question or decides an approval. The waiting worker picks the
 * response up on its next poll; this route never runs agent code itself.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = interventions.get(id);
  if (!record) return NextResponse.json({ error: "No such request." }, { status: 404 });
  if (record.status !== "pending") {
    return NextResponse.json(
      { error: record.status === "expired" ? "This request expired before it was answered." : "Already answered." },
      { status: 409 },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid reply." }, { status: 400 });
  }

  const resolved = interventions.resolve(id, parsed.data.response);
  events.append(record.runId, {
    type: "log",
    message:
      record.kind === "approval"
        ? `Decision recorded from the web UI for ${record.tool}.`
        : "Answer recorded from the web UI.",
    data: { interventionId: id },
  });
  return NextResponse.json({ intervention: resolved });
}
