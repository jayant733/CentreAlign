"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/evidence";

/**
 * A working replica of the approval request the agent raises before any
 * irreversible action. The copy and the agent's replies are the real ones from
 * the tool registry; only the decision is local to this page.
 */

type Decision = "pending" | "approved" | "declined";

const REPLY: Record<Exclude<Decision, "pending">, string> = {
  approved:
    "Approved by you. The payment is released and its reference is recorded in the case file, next to who allowed it.",
  declined:
    "A human declined to approve pay_bill. Do not attempt this action again. Either continue with the rest of the task or report that it cannot be completed.",
};

export function ApprovalGate() {
  const [decision, setDecision] = useState<Decision>("pending");

  return (
    <section className="border-t border-seam/60 bg-room-2">
      <div className="mx-auto grid max-w-[1320px] gap-14 px-6 py-28 md:grid-cols-2 md:items-center md:px-10 md:py-36">
        <div>
          <h2 className="display text-[clamp(2.6rem,4.8vw,4.6rem)]">
            Some things wait for you
          </h2>
          <p className="mt-6 max-w-[44ch] text-[17px] leading-[1.65] text-ink-2">
            Tools that move money or can&rsquo;t be undone are marked dangerous in the registry. The
            agent can&rsquo;t call them on its own authority, and there is no prompt it can be talked
            into that changes that. If nobody answers, it fails safe.
          </p>
          <p className="mt-4 max-w-[44ch] text-[15px] leading-[1.65] text-ink-3">
            Questions work the same way: if a request names three possible vendors, it asks before it
            touches anything.
          </p>
        </div>

        <div className="relative">
          <div className="tape h-3 rounded-t-[var(--radius-bench)]" aria-hidden />
          <div className="rounded-b-[var(--radius-bench)] border border-t-0 border-seam bg-bench p-6 shadow-[var(--shadow-sheet)] md:p-8">
            <p className="text-[13px] font-semibold tracking-[0.06em] text-tape uppercase">
              Approval needed
            </p>
            <p className="mt-3 text-[20px] leading-snug font-semibold text-ink">
              Release a payment for INV-GBX-7741 to Globex Logistics
            </p>
            <dl className="data mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[13px]">
              <dt className="text-ink-3">tool</dt>
              <dd className="text-ink">pay_bill</dd>
              <dt className="text-ink-3">invoice</dt>
              <dd className="text-ink">INV-GBX-7741</dd>
              <dt className="text-ink-3">effect</dt>
              <dd className="text-ink-2">moves money · cannot be undone</dd>
            </dl>

            <AnimatePresence mode="wait" initial={false}>
              {decision === "pending" ? (
                <motion.div
                  key="ask"
                  exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
                  transition={{ duration: 0.25 }}
                  className="mt-7 flex flex-wrap gap-3"
                >
                  <Button tone="tape" onClick={() => setDecision("approved")}>
                    Approve payment
                  </Button>
                  <Button tone="quiet" onClick={() => setDecision("declined")}>
                    Decline
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="reply"
                  initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="mt-7"
                >
                  <p className="text-[13px] text-ink-3">What the agent is told</p>
                  <p
                    className={
                      "data mt-2 rounded-[6px] bg-room px-4 py-3 text-[13px] leading-relaxed " +
                      (decision === "approved" ? "text-seal" : "text-oxide")
                    }
                  >
                    {REPLY[decision]}
                  </p>
                  <button
                    type="button"
                    onClick={() => setDecision("pending")}
                    className="mt-4 text-[14px] text-ink-2 underline decoration-seam-2 underline-offset-4 hover:text-ink"
                  >
                    Ask again
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
