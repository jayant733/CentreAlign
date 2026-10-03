"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/evidence";

const EXAMPLES = [
  {
    label: "Invoice to ERP",
    goal: "Find the latest invoice from Acme, extract the total amount payable and the due date, enter it into NimbusERP, and tell me once it is done.",
  },
  {
    label: "Reconcile bills",
    goal: "Check every open bill in NimbusERP against its invoice in the vendor portal and tell me which ones disagree, and by how much.",
  },
  {
    label: "CSV export",
    goal: "Download all of Umbrella Freight's invoices from the vendor portal and write a CSV with invoice number, date, total and due date.",
  },
  {
    label: "Ambiguous request",
    goal: "Enter the latest invoice from Globex into the ERP.",
  },
  {
    label: "Needs approval",
    goal: "Pay the Globex Logistics bill for INV-GBX-7741.",
  },
];

export function NewCase({ initialGoal }: { initialGoal?: string }) {
  const router = useRouter();
  const [goal, setGoal] = useState(initialGoal ?? "");
  const [busy, setBusy] = useState(false);
  const ready = goal.trim().length >= 8;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "The case could not be opened.");
      router.push(`/runs/${body.run.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The case could not be opened.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full">
      <label htmlFor="goal" className="text-[14px] font-semibold text-ink-2">
        What needs doing?
      </label>
      <div className="paper mt-3 rounded-[var(--radius-bench)] bg-manila p-1.5 shadow-[var(--shadow-sheet)]">
        <textarea
          id="goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
          }}
          rows={4}
          autoFocus
          placeholder="Describe the task the way you'd hand it to a colleague."
          className="block w-full resize-none rounded-[7px] bg-transparent px-4 py-3.5 text-[18px] leading-relaxed text-kraft-ink placeholder:text-kraft-ink-2/70 focus:outline-none"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-kraft-ink/15 px-3 py-2.5">
          <p className="text-[13px] text-kraft-ink-2">
            Runs against the sandbox company. Anything irreversible waits for your approval.
          </p>
          <Button
            type="submit"
            disabled={!ready || busy}
            className="bg-kraft-ink px-5 py-2.5 text-manila shadow-none hover:bg-[#3d2f1e]"
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
            Open the case
            {!busy && <ArrowRight className="size-4" strokeWidth={2.4} />}
          </Button>
        </div>
      </div>

      <div className="mt-6">
        <p className="text-[13px] text-ink-3">Or start from one of these:</p>
        <ul className="mt-2.5 flex flex-wrap gap-2">
          {EXAMPLES.map((ex, i) => (
            <motion.li
              key={ex.label}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <button
                type="button"
                onClick={() => setGoal(ex.goal)}
                title={ex.goal}
                className={
                  "rounded-full border px-3.5 py-1.5 text-[14px] transition-colors " +
                  (goal === ex.goal
                    ? "border-manila/70 bg-manila/10 text-ink"
                    : "border-seam-2 text-ink-2 hover:border-ink-3 hover:text-ink")
                }
              >
                {ex.label}
              </button>
            </motion.li>
          ))}
        </ul>
      </div>
    </form>
  );
}
