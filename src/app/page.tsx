import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ButtonLink, Wordmark } from "@/components/evidence";
import { SiteHeader } from "@/components/SiteHeader";
import { ApprovalGate } from "@/components/landing/ApprovalGate";
import { CaseFileStory } from "@/components/landing/CaseFileStory";
import { Custody } from "@/components/landing/Custody";
import { Hero } from "@/components/landing/Hero";

const EXAMPLES = [
  "Find the latest invoice from Acme, extract the total and due date, and enter it into NimbusERP.",
  "Check every bill in NimbusERP against its invoice in the portal and tell me which ones disagree.",
  "Download all of Umbrella Freight’s open invoices and write me a CSV summary.",
];

export default function Home() {
  return (
    <div className="room">
      <SiteHeader />
      <main>
        <Hero />
        <CaseFileStory />
        <Custody />
        <ApprovalGate />

        <section className="border-t border-seam/60">
          <div className="mx-auto max-w-[1320px] px-6 py-28 md:px-10 md:py-40">
            <h2 className="display max-w-[14ch] text-[clamp(3rem,7vw,6rem)]">
              Hand it something <span className="text-manila">tedious</span>
            </h2>
            <ul className="mt-12 max-w-[760px] divide-y divide-seam/80 border-y border-seam/80">
              {EXAMPLES.map((e) => (
                <li key={e}>
                  <Link
                    href={`/mission?goal=${encodeURIComponent(e)}`}
                    className="group flex items-center justify-between gap-6 py-5 text-[17px] leading-snug text-ink-2 transition-colors hover:text-ink"
                  >
                    <span>{e}</span>
                    <ArrowRight
                      className="size-5 shrink-0 text-ink-3 transition-transform duration-300 ease-[var(--ease-out-expo)] group-hover:translate-x-1 group-hover:text-manila"
                      strokeWidth={2}
                    />
                  </Link>
                </li>
              ))}
            </ul>
            <ButtonLink href="/mission" className="mt-12 px-6 py-3.5 text-[16px]">
              Open a case
              <ArrowRight className="size-4" strokeWidth={2.4} />
            </ButtonLink>
          </div>
        </section>
      </main>

      <footer className="border-t border-seam/60">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-6 px-6 py-10 text-[14px] text-ink-3 md:px-10">
          <Wordmark className="text-ink-2" />
          <p className="max-w-[60ch]">
            Prototype. Northwind Manufacturing, its vendors, invoices and ledger are synthetic and run
            locally. No real systems or credentials are involved.
          </p>
        </div>
      </footer>
    </div>
  );
}
