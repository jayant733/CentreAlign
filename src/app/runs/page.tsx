import type { Metadata } from "next";
import { read } from "@/agent/db-read";
import { ButtonLink } from "@/components/evidence";
import { CaseList } from "@/components/mission/CaseList";
import { SiteHeader } from "@/components/SiteHeader";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Case files — Praxis" };

export default async function RunsPage() {
  const all = await read.runs(100);
  return (
    <div className="room">
      <SiteHeader />
      <main className="mx-auto max-w-[1180px] px-6 pt-32 pb-24 md:px-10 lg:pt-40">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h1 className="display text-[clamp(2.8rem,5.4vw,4.8rem)]">Case files</h1>
          <ButtonLink href="/mission">Open a case</ButtonLink>
        </div>
        <p className="mt-4 max-w-[60ch] text-[17px] leading-[1.6] text-ink-2">
          Every run keeps its full trail: the plan, each action and screenshot, every review, and the
          verdict.
        </p>
        <div className="mt-12">
          <CaseList runs={all} empty="No cases yet." />
        </div>
      </main>
    </div>
  );
}
