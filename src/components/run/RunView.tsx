"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { ArrowLeft, Check, Circle, LoaderCircle, X } from "lucide-react";
import { Button, ExhibitTag, Seal, Wordmark, type SealState } from "@/components/evidence";
import { InterventionCard } from "@/components/run/InterventionCard";
import { Shot } from "@/components/run/Shot";
import { Trail } from "@/components/run/Trail";
import { cn } from "@/lib/cn";
import { buildTrail, formatDuration, STATUS_COPY } from "@/lib/trail";
import {
  TERMINAL_RUN_STATUSES,
  type Artifact,
  type EventRecord,
  type InterventionRecord,
  type MemoryFact,
  type RunRecord,
  type StepRecord,
} from "@/agent/types";

export interface RunSnapshot {
  run: RunRecord;
  steps: StepRecord[];
  facts: MemoryFact[];
  artifacts: Artifact[];
  pending: InterventionRecord[];
  events: EventRecord[];
}

const MAX_ACTIONS = 80;

const stepIcon = {
  pending: { Icon: Circle, cls: "text-ink-3" },
  running: { Icon: LoaderCircle, cls: "text-manila animate-spin" },
  passed: { Icon: Check, cls: "text-seal" },
  failed: { Icon: X, cls: "text-oxide" },
  skipped: { Icon: Circle, cls: "text-ink-3" },
} as const;

function sealFor(run: RunRecord): SealState {
  if (run.status === "succeeded") return "verified";
  if (run.status === "failed" || run.status === "cancelled") return "failed";
  if (run.status === "awaiting_human") return "needs-you";
  return "pending";
}

export function RunView({ initial }: { initial: RunSnapshot }) {
  const [snap, setSnap] = useState(initial);
  const [events, setEvents] = useState(initial.events);
  const [now, setNow] = useState(() => Date.now());
  const trailBox = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const lastId = useRef(initial.events.at(-1)?.id ?? 0);

  const { run } = snap;
  const done = TERMINAL_RUN_STATUSES.includes(run.status);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/runs/${run.id}`, { cache: "no-store" });
    if (res.ok) {
      const next = (await res.json()) as RunSnapshot;
      setSnap(next);
    }
  }, [run.id]);

  // Live trace. Events stream in; everything derived (steps, facts, pending
  // approvals) is re-read as one snapshot, debounced, so the two never disagree.
  useEffect(() => {
    if (done) return;
    let pending: ReturnType<typeof setTimeout> | null = null;
    const source = new EventSource(`/api/runs/${run.id}/events?after=${lastId.current}`);
    source.addEventListener("trace", (msg) => {
      const e = JSON.parse((msg as MessageEvent).data) as EventRecord;
      if (e.id <= lastId.current) return;
      lastId.current = e.id;
      setEvents((prev) => [...prev, e]);
      if (!pending) pending = setTimeout(() => ((pending = null), void refresh()), 350);
    });
    source.addEventListener("end", () => {
      source.close();
      void refresh();
    });
    return () => {
      source.close();
      if (pending) clearTimeout(pending);
    };
  }, [run.id, done, refresh]);

  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [done]);

  const trail = useMemo(() => buildTrail(events), [events]);

  useEffect(() => {
    const box = trailBox.current;
    if (box && stick.current) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [trail.length]);

  const shots = snap.artifacts.filter((a) => a.kind === "screenshot" && a.url);
  const latest = shots.at(-1);
  const files = snap.artifacts.filter((a) => a.kind !== "screenshot");
  const elapsed = (done ? run.updatedAt : now) - run.createdAt;
  const status = STATUS_COPY[run.status];
  const stalledInQueue = run.status === "queued" && now - run.createdAt > 6000;

  async function cancel() {
    const res = await fetch(`/api/runs/${run.id}`, { method: "DELETE" });
    if (res.ok) {
      toast("Cancelled. The worker stops at its next check.");
      void refresh();
    }
  }

  return (
    <div className="room flex min-h-dvh flex-col">
      {/* Case header */}
      <header className="sticky top-0 z-20 border-b border-seam/70 bg-room/90 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 md:px-8">
          <Link href="/" aria-label="Praxis home" className="text-ink">
            <Wordmark />
          </Link>
          <Link href="/mission" className="flex items-center gap-1.5 text-[14px] text-ink-2 hover:text-ink">
            <ArrowLeft className="size-4" /> New case
          </Link>
          <div className="ml-auto flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px]">
            <span className="data text-ink-3">case {run.id}</span>
            <span
              className={cn(
                "flex items-center gap-2 font-semibold",
                { ink: "text-ink", tape: "text-tape", seal: "text-seal", oxide: "text-oxide" }[status.tone],
              )}
            >
              {!done && <span className="size-2 animate-pulse rounded-full bg-current" aria-hidden />}
              {status.label}
            </span>
            <span className="data text-ink-2">{formatDuration(elapsed)}</span>
            <span className="data text-ink-2">
              {run.actionsUsed}/{MAX_ACTIONS} actions
            </span>
            {!done && (
              <Button tone="quiet" onClick={cancel} className="px-3 py-1.5 text-[13px]">
                Cancel
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="grid flex-1 gap-6 px-5 py-6 md:px-8 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_400px]">
        {/* Left: the brief and the exhibits */}
        <aside className="space-y-7 lg:sticky lg:top-[76px] lg:max-h-[calc(100dvh-100px)] lg:self-start lg:overflow-y-auto lg:pr-1">
          <section>
            <h1 className="text-[19px] leading-snug font-semibold text-ink">{run.goal}</h1>
            {run.plan?.restatedGoal && (
              <p className="mt-2 text-[14px] leading-relaxed text-ink-3">
                Understood as: {run.plan.restatedGoal}
              </p>
            )}
          </section>

          <section aria-labelledby="exhibits">
            <h2 id="exhibits" className="text-[12px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
              Plan
            </h2>
            {snap.steps.length === 0 ? (
              <p className="mt-3 text-[14px] text-ink-3">
                {run.status === "queued" ? "Not started yet." : "Working out the steps."}
              </p>
            ) : (
              <ol className="mt-3 space-y-3.5">
                {snap.steps.map((s) => {
                  const { Icon, cls } = stepIcon[s.status];
                  return (
                    <li key={s.stepId} className="flex gap-3">
                      <Icon className={cn("mt-0.5 size-4 shrink-0", cls)} strokeWidth={2.4} aria-label={s.status} />
                      <div className="min-w-0">
                        <p className={cn("text-[14px] leading-snug", s.status === "pending" ? "text-ink-2" : "text-ink")}>
                          <span className="data mr-1.5 text-ink-3">{s.stepId}</span>
                          {s.title}
                        </p>
                        <p className="mt-1 text-[12.5px] leading-snug text-ink-3">Passes when: {s.successCriterion}</p>
                        {s.attempts > 1 && (
                          <p className="data mt-1 text-[11.5px] text-tape">attempt {s.attempts}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section aria-labelledby="facts">
            <h2 id="facts" className="text-[12px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
              Facts recorded
            </h2>
            {snap.facts.length === 0 ? (
              <p className="mt-3 text-[14px] text-ink-3">Nothing yet. Facts appear as the agent reads them off a source.</p>
            ) : (
              <dl className="mt-3 space-y-2.5">
                {snap.facts.map((f) => (
                  <div key={f.key}>
                    <dt className="data text-[11.5px] text-ink-3">{f.key}</dt>
                    <dd className="text-[14px] text-ink">
                      {f.value}
                      {f.source && <span className="block text-[12px] text-ink-3">from {f.source}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        </aside>

        {/* Centre: the trail */}
        <section aria-labelledby="trail-h" className="min-w-0">
          <h2 id="trail-h" className="sr-only">
            What the agent did
          </h2>
          <div
            ref={trailBox}
            onScroll={(e) => {
              const el = e.currentTarget;
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
            className="rounded-[var(--radius-bench)] border border-seam/70 bg-room-2/70 px-2 py-3 lg:max-h-[calc(100dvh-100px)] lg:overflow-y-auto 2xl:pl-[76px]"
          >
            {trail.length === 0 ? (
              <div className="grid min-h-[300px] place-items-center px-6 text-center">
                <div>
                  <LoaderCircle className="mx-auto size-6 animate-spin text-ink-3" />
                  <p className="mt-4 text-[15px] text-ink-2">
                    {stalledInQueue ? "No worker has picked this up yet." : "Opening the case."}
                  </p>
                  {stalledInQueue && (
                    <p className="mt-2 text-[14px] text-ink-3">
                      Start one in another terminal with <code className="data text-ink-2">npm run worker</code>.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <Trail entries={trail} live={!done} />
            )}
          </div>
        </section>

        {/* Right: what needs you, the verdict, and what the agent sees */}
        <aside className="space-y-6 lg:col-span-2 xl:sticky xl:top-[76px] xl:col-span-1 xl:max-h-[calc(100dvh-100px)] xl:self-start xl:overflow-y-auto">
          <AnimatePresence>
            {snap.pending.map((p) => (
              <InterventionCard key={p.id} intervention={p} onResolved={refresh} />
            ))}
          </AnimatePresence>

          {done && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="paper relative rounded-[var(--radius-bench)] bg-manila p-5 text-kraft-ink shadow-[var(--shadow-sheet)]"
              aria-labelledby="verdict-h"
            >
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <h2 id="verdict-h" className="font-[family-name:var(--font-stencil)] text-[20px] font-black tracking-wide">
                    Verdict
                  </h2>
                  <p className="mt-2 text-[15px] leading-snug font-medium">
                    {run.verdict?.summary ?? run.summary ?? run.error ?? "No summary was recorded."}
                  </p>
                </div>
                <motion.div
                  initial={{ scale: 1.7, rotate: -28, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  transition={{ delay: 0.35, duration: 0.32, ease: [0.7, 0, 0.84, 0] }}
                  className="shrink-0"
                >
                  <Seal state={sealFor(run)} size={104} onPaper />
                </motion.div>
              </div>
              {run.verdict && run.verdict.checks.length > 0 && (
                <ul className="mt-4 space-y-2.5 border-t border-kraft-ink/20 pt-4">
                  {run.verdict.checks.map((c) => (
                    <li key={c.description} className="flex gap-2.5 text-[13.5px] leading-snug">
                      {c.passed ? (
                        <Check className="mt-0.5 size-4 shrink-0 text-[#2d7a52]" strokeWidth={2.6} />
                      ) : (
                        <X className="mt-0.5 size-4 shrink-0 text-[#b23a26]" strokeWidth={2.6} />
                      )}
                      <span>
                        <span className="font-semibold">{c.description}</span>
                        <span className="mt-0.5 block text-[12.5px] text-kraft-ink-2">{c.evidence}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </motion.section>
          )}

          <section aria-labelledby="view-h">
            <div className="flex items-baseline justify-between">
              <h2 id="view-h" className="text-[12px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
                What the agent sees
              </h2>
              {shots.length > 0 && <span className="data text-[12px] text-ink-3">{shots.length} screenshots</span>}
            </div>
            {latest ? (
              <div className="mt-3">
                <Shot artifact={latest} className="aspect-[1280/820] w-full" />
                <p className="mt-2 truncate text-[13px] text-ink-3">{latest.label}</p>
                {shots.length > 1 && (
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {shots.slice(-9, -1).reverse().map((s) => (
                      <Shot key={s.id} artifact={s} className="aspect-[1280/820]" />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 grid aspect-[1280/820] place-items-center rounded-[4px] border border-dashed border-seam-2 text-[14px] text-ink-3">
                The browser hasn&rsquo;t opened yet.
              </div>
            )}
          </section>

          {files.length > 0 && (
            <section aria-labelledby="files-h">
              <h2 id="files-h" className="text-[12px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
                Files produced
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {files.map((f) => (
                  <li key={f.id}>
                    {f.url ? (
                      <a href={f.url} target="_blank" rel="noreferrer" className="hover:brightness-110">
                        <ExhibitTag exhibit={f.kind}>{f.label}</ExhibitTag>
                      </a>
                    ) : (
                      <ExhibitTag exhibit={f.kind}>{f.label}</ExhibitTag>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </main>
    </div>
  );
}
