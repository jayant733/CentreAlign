import {
  MessageChannel,
  Worker,
  receiveMessageOnPort,
  type MessagePort as WorkerMessagePort,
} from "node:worker_threads";
import path from "node:path";

/**
 * The rest of the app was written against a synchronous database. Postgres is
 * asynchronous, and `Atomics.wait` is the one way to bridge that without
 * turning every call site into an await. Queries run on a worker thread; this
 * thread blocks only for that one round trip.
 */

type Row = Record<string, unknown>;

interface Ok {
  rows: Row[];
  rowCount: number;
}

interface Fail {
  error: string;
}

type Reply = Ok | Fail;

function getWorker(): Worker {
  const slot = globalThis as unknown as { __praxisPgWorker?: Worker };
  if (slot.__praxisPgWorker) return slot.__praxisPgWorker;
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Add the Neon connection string to .env. " +
        "It is gitignored and must not be committed.",
    );
  }
  const file = path.join(process.cwd(), "src", "db", "pg-worker.cjs");
  const next = new Worker(file, { env: process.env });
  next.unref();
  next.on("error", (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[praxis] database worker:", message);
  });
  next.on("exit", (code) => {
    if (slot.__praxisPgWorker === next) slot.__praxisPgWorker = undefined;
    if (code !== 0) console.error(`[praxis] database worker exited with code ${code}`);
  });
  slot.__praxisPgWorker = next;
  return next;
}

function exec(sql: string, params: unknown[]): Ok {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  const { port1, port2 } = new MessageChannel();
  getWorker().postMessage({ sql, params, port: port2, signal }, [port2]);
  const status = Atomics.wait(signal, 0, 0, 45_000);
  const got = receiveMessageOnPort(port1) ?? receiveSoon(port1);
  if (!got) {
    throw new Error(
      status === "timed-out"
        ? `Database timed out: ${sql.slice(0, 140)}`
        : `Database worker returned no result: ${sql.slice(0, 140)}`,
    );
  }
  const message = got.message as Reply;
  if ("error" in message && message.error) throw new Error(message.error);
  return message as Ok;
}

/** The wake and the port message are not the same queue. Give the port a moment. */
function receiveSoon(port: WorkerMessagePort): { message: unknown } | undefined {
  const started = Date.now();
  while (Date.now() - started < 1000) {
    const got = receiveMessageOnPort(port);
    if (got) return got;
  }
  return undefined;
}

function numbered(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

/**
 * Non-blocking variant for the web server. A request handler that blocks the
 * event loop for a round trip to Neon stalls every other request, so pages and
 * API routes await this instead. The worker keeps the synchronous API: it runs
 * one task at a time and has nothing else to do while it waits.
 */
export function query(sql: string, params: unknown[] = []): Promise<Ok> {
  const { port1, port2 } = new MessageChannel();
  return new Promise((resolve, reject) => {
    port1.once("message", (message: Reply) => {
      port1.close();
      if ("error" in message && message.error) reject(new Error(message.error));
      else resolve(message as Ok);
    });
    getWorker().postMessage({ sql: numbered(sql), params, port: port2 }, [port2]);
  });
}

export function statement(sql: string) {
  const text = numbered(sql);
  return {
    run(...params: unknown[]) {
      const { rows, rowCount } = exec(text, params);
      return { changes: rowCount, lastInsertRowid: Number(rows[0]?.id ?? 0) };
    },
    get(...params: unknown[]) {
      return exec(text, params).rows[0];
    },
    all(...params: unknown[]) {
      return exec(text, params).rows;
    },
  };
}
