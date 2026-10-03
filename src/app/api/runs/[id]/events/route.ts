import { events, runs } from "@/agent/db";
import { TERMINAL_RUN_STATUSES } from "@/agent/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_MS = 600;

/**
 * Live trace as Server-Sent Events.
 *
 * The worker writes events to SQLite from another process, so this tails the
 * table rather than subscribing to anything in memory. `?after=<id>` resumes
 * from a known event, which is also what EventSource reconnection sends via
 * Last-Event-ID.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!runs.get(id)) return new Response("No such run.", { status: 404 });

  const url = new URL(req.url);
  let after = Number(req.headers.get("last-event-id") ?? url.searchParams.get("after") ?? 0) || 0;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (!closed) controller.enqueue(encoder.encode(chunk));
      };

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        clearInterval(heartbeat);
        controller.close();
      };

      const tick = () => {
        for (const e of events.list(id, after, 200)) {
          after = e.id;
          send(`id: ${e.id}\nevent: trace\ndata: ${JSON.stringify(e)}\n\n`);
        }
        const run = runs.get(id);
        if (!run || TERMINAL_RUN_STATUSES.includes(run.status)) {
          send(`event: end\ndata: ${JSON.stringify({ status: run?.status })}\n\n`);
          close();
        }
      };

      const timer = setInterval(tick, POLL_MS);
      const heartbeat = setInterval(() => send(": keep-alive\n\n"), 15_000);
      req.signal.addEventListener("abort", close);
      tick();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
