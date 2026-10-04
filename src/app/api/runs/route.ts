import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { runs } from "@/agent/db";
import { read } from "@/agent/db-read";

export const runtime = "nodejs";

/**
 * The API enqueues work; it never executes it. A task drives a real browser
 * for minutes, which does not belong inside a request handler, so the worker
 * process picks runs up from the database instead.
 */
export async function POST(req: Request) {
  let body: { goal?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const goal = typeof body.goal === "string" ? body.goal.trim() : "";
  if (goal.length < 8) {
    return NextResponse.json(
      { error: "Describe the task in a sentence so the agent has something to plan from." },
      { status: 422 },
    );
  }

  const id = nanoid(10);
  const run = runs.create(id, goal);
  return NextResponse.json({ run }, { status: 201 });
}

export async function GET() {
  return NextResponse.json({ runs: await read.runs(60) });
}
