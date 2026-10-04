# Praxis

An autonomous worker for operations tasks. You describe the job in a sentence. Praxis plans it, does it in a browser and over HTTP, recovers when a system misbehaves, and checks the result through a different route before it tells you the work is done.

The company it works in is synthetic. Northwind Manufacturing, its vendors, invoices and ledger all run locally. Nothing here talks to a real business system.

## Setup

Node 22 or newer. Cases and the sandbox company are stored in Neon Postgres. Set `DATABASE_URL` in `.env` to the connection string. Invoice PDFs and screenshots still live on disk under `.data` and `public/artifacts`.

```bash
npm install
npx playwright install chromium
cp .env.example .env
```

Put a Gemini API key in `.env` as `GEMINI_API_KEY`. The key stays in that file. It is gitignored.

Seed the sandbox, then start the app and the worker in two terminals:

```bash
npm run seed
npm run dev
npm run worker
```

Open http://localhost:3000. "Open a case" is the thing you hand a task to. The worker picks it up within a second. A run takes a few minutes, because the free-tier models are paced.

To run one task from the terminal instead of the UI:

```bash
npm run task -- "Find the latest invoice from Acme, extract the total amount payable and the due date, enter it into NimbusERP, and tell me once it is done."
```

The CLI asks you directly when the agent needs an approval or an answer.

## Docker

The image runs the web server and the worker together. Both talk to Neon through `DATABASE_URL`. The volume only keeps invoice PDFs, screenshots and the workspace. Seeding runs only when the sandbox has no vendors. `npm run seed` deletes the company and rebuilds it.

```bash
docker compose up --build
```

`GEMINI_API_KEY` is read from the shell or from a `.env` file next to `docker-compose.yml`. Open http://localhost:3000.

A single container without Compose:

```bash
docker build -t praxis .
docker run -d -p 3000:3000 \
  -v praxis_data:/app/.data \
  -e GEMINI_API_KEY="your_key" \
  -e DATABASE_URL="your_neon_url" \
  --name praxis-app praxis
```

Do not set `PRAXIS_BASE_URL` in Docker. The agent's browser runs inside the container and the entrypoint points it at whatever port the host assigned, so it works on Railway, Render and Fly without changes. If a proxy sits in front, disable response buffering for `/api/runs/*/events` or the live trail will arrive in one chunk at the end.

## What a run actually does

1. The planner turns the sentence into steps. Each step has a success criterion another person could check by looking.
2. The actor takes one action at a time: browser, PDF, HTTP, or a file. It sees a compressed view of the page, with elements numbered, and it addresses them by those numbers.
3. A separate reviewer reads the transcript of the step and returns pass, retry, replan, or escalate. The model that did the work is not the one that grades it.
4. The verifier reads the systems again, read-only, preferably through a different route than the work took, and writes the summary you see.
5. Notes about how the systems behave are kept and handed to the next run.

Payments never run on the agent's authority. `pay_bill` stops and asks. If the amount on the bill does not match the invoice total, it refuses before it even asks.

## Architecture

```
browser  →  POST /api/runs   →  Neon (schema agent)
                                      ↑
worker (scripts/worker.ts) ───────────┘  →  Playwright, sandbox HTTP
                                      ↓
browser  ←  SSE /api/runs/:id/events
```

The API only enqueues. A task drives a real browser for minutes, which does not belong inside a request. The UI tails the events table, so it stays live while the worker runs in another process.

The sandbox is a second schema (`sandbox`) in the same Neon database, plus a set of ordinary Next.js pages: a vendor portal with a login, a cookie wall, paging and PDFs, and NimbusERP with a strict bill form and a read API. The agent reaches them the way an employee would. It is not given the quirks. The portal lists amounts without tax, sorts by invoice number rather than date, and fails the first PDF download. The agent has to notice.

## Design decisions

- **Criteria, not scripts.** The plan says what must be true, never which button to press. That is what lets the same loop do an invoice, a reconciliation, and a CSV.
- **One observation at a time.** Page text is the expensive part of the context. Older actions collapse to a line. Facts the agent recorded are what carry forward.
- **Fail safe.** An approval that times out (15 minutes) is a denial. Cancelling a run expires anything still waiting.
- **A loop guard.** The same failing call three times ends the attempt, so a stuck model cannot burn the whole action budget on one click.
- **Two model tiers.** Planning, review and verification use `gemini-3.8-flash` (5 requests a minute). Choosing the next action uses `gemini-3.5-flash-lite` (15 a minute). A pacer honours the server's retry delay, and a fallback chain switches model on 429, 503, or a model that declines to call a tool.

## Models, APIs, frameworks

| | |
|---|---|
| Models | Gemini via `@google/genai`. Reasoning `gemini-3.8-flash`. Action and fast `gemini-3.5-flash-lite`. Fallbacks `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-flash-lite-latest`. |
| Browser | Playwright, Chromium. |
| PDFs | `pdf-lib` to generate the sandbox invoices, `pdfjs-dist` to read them. |
| App | Next.js 16 App Router, React 19, Tailwind v4, Neon Postgres. |
| UI | React Three Fiber, GSAP, Motion. |
| Tools | MCP, both directions. See below. |

## MCP

**Praxis as a server.** Other agents can hand it work:

```bash
npm run mcp
```

That speaks MCP over stdio and exposes four tools:

| Tool | What it does |
|---|---|
| `run_task` | Queue a goal. Returns a case id and a URL. |
| `get_run` | Status, plan, summary, verdict, and anything waiting on a person. |
| `approve_action` | Answer a pending approval or question. `yes` or `no`, then an optional note. |
| `list_capabilities` | The tools the worker can call, and which ones need approval. |

A client config looks like this:

```json
{
  "mcpServers": {
    "praxis": {
      "command": "npx",
      "args": ["tsx", "--env-file=.env", "scripts/mcp-server.ts"]
    }
  }
}
```

The worker still has to be running. The server only enqueues and reads.

**Praxis as a client.** On startup the worker reads `mcp.config.json` and wraps every remote tool as one of its own, namespaced `server__tool`. Tools listed in `dangerousTools` go through the same approval gate. Copy `mcp.config.example.json` to start. A server that fails to launch is skipped, so a missing integration does not stop the agent.

## Eval

```bash
npm run eval
npm run eval -- invoice
```

Five tasks, scored on the records they leave behind: the Acme invoice entered at the right total, the seeded Globex mismatch found, an Umbrella CSV written, an ambiguous request that asks instead of guessing, and a payment that waits for approval and then lands. Names: `invoice`, `reconcile`, `csv`, `ambiguous`, `payment`. Each one is a full run, so the set takes a while. The dev server must be up.

The invoice task deletes any existing bill for INV-ACM-2012 first, so it can be entered again. The payment task builds a bill for UFC-55301 that matches its invoice, then expects the agent to ask before paying.

## Assumptions

- One operator, one worker, one machine. There is no account system.
- The sandbox is the whole company. Credentials in `.env` are fake and only work locally.
- "Latest invoice" means the latest issue date, not the highest invoice number.
- The amount to record or pay is the invoice total, tax included, not the subtotal.
- A human is available within 15 minutes when the agent asks. Otherwise the run fails.
- The free-tier Gemini quota is enough for one run at a time, not a queue of them.

## Known limitations

- Runs are minutes long, and a second run started while the first is going will queue behind it. The pacer will not let them share a quota gracefully.
- The reviewer can still pass a weak transcript if the model is feeling generous. The payment check is the one place a disagreement is refused in code rather than in a prompt.
- The browser session is one Chromium per run, headless by default in `.env`. Set `PRAXIS_HEADLESS=false` to watch it.
- Recipe notes are prose the next planner reads. They are not tested, and a bad note can stick.
- The MCP server cannot run the task itself. If the worker is down, `run_task` queues a case that sits there.
- Eval's reconciliation check looks for the Globex mismatch in the summary and the recorded facts. A correct finding phrased in a way the check does not recognise will score as a miss.

## What I would build next

- A match step that is a real ledger control for every payment, with the two amounts shown on the approval card.
- The worker running tasks in parallel, with a quota budget per run instead of one global pacer.
- Recipe notes that expire, and that a later run can contradict.
- An MCP tool that streams events, so a client does not have to poll `get_run`.
- Hosting the sandbox and the worker separately, so a demo does not depend on one laptop.

## The interface

The visual language is a case file: a dark room, manila paper, kraft exhibit tags, and a seal that means the work was checked. Colour is reserved for three states. Amber means a person has to answer, green means verified, red means it failed. `DESIGN.md` records the tokens.
