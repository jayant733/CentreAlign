import type { Metadata } from "next";
import Link from "next/link";
import { read } from "@/agent/db-read";
import { CaseList } from "@/components/mission/CaseList";
import { NewCase } from "@/components/mission/NewCase";
import { SiteHeader } from "@/components/SiteHeader";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Open a case — Praxis" };

export default async function MissionPage({ searchParams }: { searchParams: Promise<{ goal?: string }> }) {
  const { goal } = await searchParams;
  const recent = await read.runs(6);

  return (
    <div className="room">
      <SiteHeader />
      <main className="mx-auto grid max-w-[1180px] gap-16 px-6 pt-32 pb-24 md:px-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:pt-40">
        <section>
          <h1 className="display text-[clamp(2.8rem,5.4vw,4.8rem)]">Open a case</h1>
          <p className="mt-4 max-w-[52ch] text-[17px] leading-[1.6] text-ink-2">
            Praxis plans the work, does it in the vendor portal and the ERP, and comes back with a
            verdict and the evidence behind it. You can watch, and you&rsquo;ll be asked before anything
            irreversible happens.
          </p>
          <div className="mt-10">
            <NewCase initialGoal={goal} />
          </div>
        </section>

        <section aria-labelledby="recent" className="lg:pt-6">
          <div className="flex items-baseline justify-between">
            <h2 id="recent" className="text-[12px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
              Recent cases
            </h2>
            <Link href="/runs" className="text-[14px] text-ink-2 hover:text-ink">
              All cases
            </Link>
          </div>
          <div className="mt-4">
            <CaseList runs={recent} empty="No cases yet. The first one you open will appear here." />
          </div>
        </section>
      </main>
    </div>
  );
}
