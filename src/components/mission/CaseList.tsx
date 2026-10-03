import Link from "next/link";
import type { RunRecord } from "@/agent/types";
import { cn } from "@/lib/cn";
import { formatDuration, STATUS_COPY } from "@/lib/trail";

const toneText = { ink: "text-ink-2", tape: "text-tape", seal: "text-seal", oxide: "text-oxide" } as const;

export function CaseList({ runs, empty }: { runs: RunRecord[]; empty: string }) {
  if (runs.length === 0) return <p className="text-[15px] text-ink-3">{empty}</p>;

  return (
    <ul className="divide-y divide-seam/80 border-y border-seam/80">
      {runs.map((r) => {
        const s = STATUS_COPY[r.status];
        return (
          <li key={r.id}>
            <Link
              href={`/runs/${r.id}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 gap-y-1 px-1 py-4 transition-colors hover:bg-bench/50 sm:grid-cols-[minmax(0,1fr)_140px_110px]"
            >
              <span className="min-w-0 truncate text-[15px] text-ink">{r.goal}</span>
              <span className={cn("text-[13px] font-semibold sm:text-left", toneText[s.tone])}>{s.label}</span>
              <span className="data hidden text-right text-[12px] text-ink-3 sm:block">
                {new Date(r.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })} ·{" "}
                {formatDuration(r.updatedAt - r.createdAt)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
