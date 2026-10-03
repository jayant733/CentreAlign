"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  CircleAlert,
  FileSearch,
  Hand,
  ListTree,
  PenLine,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { ExhibitTag } from "@/components/evidence";
import { Shot } from "@/components/run/Shot";
import { cn } from "@/lib/cn";
import { describeArgs, type TrailEntry } from "@/lib/trail";

const levelText = { info: "text-ink-3", warn: "text-tape", error: "text-oxide" } as const;

const reviewCopy = {
  pass: { label: "Reviewer: pass", cls: "text-seal", Icon: Check },
  retry: { label: "Reviewer: try again", cls: "text-tape", Icon: RotateCcw },
  replan: { label: "Reviewer: change the plan", cls: "text-tape", Icon: ListTree },
  escalate: { label: "Reviewer: ask a human", cls: "text-oxide", Icon: Hand },
} as const;

function time(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function Row({ entry, inFlight }: { entry: TrailEntry; inFlight: boolean }) {
  switch (entry.kind) {
    case "step":
      return (
        <div className="flex items-center gap-3 pt-5 pb-1">
          <ExhibitTag exhibit={`Exhibit ${entry.stepId}`} />
          <p className="min-w-0 truncate text-[15px] font-semibold text-ink">{entry.title}</p>
        </div>
      );

    case "plan":
      return (
        <p className={cn("flex items-center gap-2.5 text-[14px]", entry.revised ? "text-tape" : "text-ink-2")}>
          <ListTree className="size-4 shrink-0" />
          {entry.text}
          {entry.plan?.restatedGoal && (
            <span className="truncate text-ink-3">“{entry.plan.restatedGoal}”</span>
          )}
        </p>
      );

    case "action": {
      const detail = describeArgs(entry.tool, entry.args);
      const shot = entry.result?.artifacts.find((a) => a.kind === "screenshot");
      const failed = entry.result && !entry.result.ok;
      return (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 rounded-[6px] px-3 py-2.5 hover:bg-bench/60">
          <div className="min-w-0">
            <p className="text-[14px] leading-snug text-ink">
              {entry.verifying && <span className="mr-1.5 text-seal">Checking:</span>}
              {entry.rationale}
            </p>
            <p className="data mt-1 flex min-w-0 flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
              <span className={cn(failed ? "text-oxide" : entry.result ? "text-ink-2" : "text-ink-3")}>
                {entry.tool}
              </span>
              {detail && <span className="min-w-0 truncate">{detail}</span>}
              {!entry.result && inFlight && <span className="animate-pulse text-ink-2">running</span>}
            </p>
            {failed && entry.result?.error && (
              <p className="mt-1.5 flex gap-2 text-[13px] leading-snug text-oxide">
                <X className="mt-0.5 size-3.5 shrink-0" />
                {entry.result.error}
              </p>
            )}
          </div>
          {shot && <Shot artifact={shot} className="h-[54px] w-[86px]" />}
        </div>
      );
    }

    case "review": {
      const c = reviewCopy[entry.critique.outcome] ?? reviewCopy.retry;
      return (
        <div className={cn("mx-3 my-1 border-l-2 py-1.5 pl-3.5", entry.critique.outcome === "pass" ? "border-seal/60" : "border-tape/70")}>
          <p className={cn("flex items-center gap-2 text-[13px] font-semibold", c.cls)}>
            <c.Icon className="size-3.5" strokeWidth={2.4} />
            {c.label}
          </p>
          <p className="mt-1 text-[14px] leading-snug text-ink-2">{entry.critique.reasoning}</p>
          {entry.critique.nextActionHint && entry.critique.outcome !== "pass" && (
            <p className="mt-1 text-[13px] leading-snug text-ink-3">Next: {entry.critique.nextActionHint}</p>
          )}
        </div>
      );
    }

    case "fact":
      return (
        <p className="flex items-baseline gap-2.5 px-3 py-1 text-[13px] text-seal">
          <PenLine className="size-3.5 shrink-0 translate-y-0.5" />
          <span className="data">
            {entry.key} = <span className="text-ink">{entry.value}</span>
          </span>
          {entry.source && <span className="truncate text-ink-3">from {entry.source}</span>}
        </p>
      );

    case "human":
      return (
        <p className={cn("flex items-center gap-2.5 px-3 py-1.5 text-[14px]", entry.resolved ? "text-ink-2" : "text-tape")}>
          <Hand className="size-4 shrink-0" />
          {entry.text}
        </p>
      );

    case "verdict":
      return (
        <p className={cn("flex items-center gap-2.5 pt-4 text-[14px] font-semibold", entry.verdict.achieved ? "text-seal" : "text-oxide")}>
          {entry.verdict.achieved ? <ShieldCheck className="size-4" /> : <CircleAlert className="size-4" />}
          {entry.verdict.achieved
            ? `Verified with ${entry.verdict.confidence} confidence`
            : "Verification did not pass"}
        </p>
      );

    case "system":
      return (
        <p className={cn("flex items-center gap-2.5 px-3 py-0.5 text-[13px]", levelText[entry.level])}>
          <FileSearch className="size-3.5 shrink-0 opacity-70" />
          {entry.text}
        </p>
      );
  }
}

export function Trail({ entries: all, live }: { entries: TrailEntry[]; live: boolean }) {
  const entries = all.filter((e) => e.kind !== "finished");
  return (
    <ol className="space-y-0.5" aria-live="polite" aria-relevant="additions">
      <AnimatePresence initial={false}>
        {entries.map((entry, i) => (
          <motion.li
            key={entry.id}
            layout="position"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="group relative"
          >
            <span className="data pointer-events-none absolute top-3 -left-[68px] hidden w-[56px] text-right text-[11px] text-ink-3/70 2xl:block">
              {time(entry.ts)}
            </span>
            <Row entry={entry} inFlight={live && i === entries.length - 1} />
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}
