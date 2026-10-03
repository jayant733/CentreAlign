"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Button } from "@/components/evidence";
import type { InterventionRecord } from "@/agent/types";

/**
 * The one thing on the page that is waiting on you. Styled as hazard tape and
 * placed first in reading order, because a run that needs a human is stalled
 * until it gets one.
 */
export function InterventionCard({
  intervention,
  onResolved,
}: {
  intervention: InterventionRecord;
  onResolved: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const isApproval = intervention.kind === "approval";

  async function send(response: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/interventions/${intervention.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not send your reply.");
      toast.success(isApproval ? "Decision sent. The agent will pick it up in a moment." : "Answer sent.");
      onResolved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send your reply.");
      setBusy(false);
    }
  }

  const args = intervention.args ? Object.entries(intervention.args) : [];

  return (
    <motion.section
      aria-labelledby={`iv-${intervention.id}`}
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className="overflow-hidden rounded-[var(--radius-bench)] bg-bench shadow-[var(--shadow-sheet)] ring-1 ring-tape/40"
    >
      <div className="tape h-2.5" aria-hidden />
      <div className="p-5">
        <p className="text-[12px] font-semibold tracking-[0.08em] text-tape uppercase">
          {isApproval ? "Approval needed" : "The agent is asking you"}
        </p>
        <h2 id={`iv-${intervention.id}`} className="mt-2 text-[17px] leading-snug font-semibold text-ink">
          {intervention.prompt}
        </h2>

        {isApproval && (
          <dl className="data mt-4 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-[12.5px]">
            <dt className="text-ink-3">tool</dt>
            <dd className="text-ink">{intervention.tool}</dd>
            {args.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-ink-3">{k}</dt>
                <dd className="break-all text-ink-2">{typeof v === "string" ? v : JSON.stringify(v)}</dd>
              </div>
            ))}
          </dl>
        )}

        {!isApproval && intervention.options && intervention.options.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {intervention.options.map((o) => (
              <Button key={o} tone="quiet" disabled={busy} onClick={() => send(o)} className="px-3.5 py-2 text-[14px]">
                {o}
              </Button>
            ))}
          </div>
        )}

        <label className="mt-4 block">
          <span className="text-[13px] text-ink-3">
            {isApproval
              ? "Note for the record (optional)"
              : intervention.options?.length
                ? "Or answer in your own words"
                : "Your answer"}
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="mt-1.5 w-full resize-y rounded-[6px] border border-seam-2 bg-room px-3 py-2 text-[14px] text-ink placeholder:text-ink-3 focus:border-ink-3 focus:outline-none"
            placeholder={isApproval ? "e.g. approved by Priya, PO 4471" : "Type your answer"}
          />
        </label>

        <div className="mt-4 flex flex-wrap gap-2.5">
          {isApproval ? (
            <>
              <Button tone="tape" disabled={busy} onClick={() => send(`yes ${note}`.trim())}>
                Approve
              </Button>
              <Button tone="danger" disabled={busy} onClick={() => send(`no ${note}`.trim())}>
                Decline
              </Button>
            </>
          ) : (
            <Button tone="tape" disabled={busy || note.trim().length === 0} onClick={() => send(note.trim())}>
              Send answer
            </Button>
          )}
        </div>
      </div>
    </motion.section>
  );
}
