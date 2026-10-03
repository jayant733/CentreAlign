"use client";

import dynamic from "next/dynamic";
import { MotionConfig, motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/evidence";
import { RECORDED_RUN } from "@/lib/recorded-run";

const EvidenceTable = dynamic(() => import("@/components/three/EvidenceTable"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-room" />,
});

const ease = [0.16, 1, 0.3, 1] as const;

export function Hero() {
  const rise = (delay: number) => ({
    initial: { opacity: 0, y: 18, filter: "blur(6px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    transition: { duration: 1.1, ease, delay },
  });

  return (
    <MotionConfig reducedMotion="user">
    <section className="relative isolate min-h-[100dvh] overflow-hidden">
      <EvidenceTable className="absolute inset-0 -z-10 md:left-[34%]" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(90deg,var(--color-room)_8%,rgb(21_18_14/0.86)_34%,transparent_62%)] max-md:bg-[linear-gradient(0deg,var(--color-room)_30%,rgb(21_18_14/0.55)_62%,transparent)]"
      />

      <div className="mx-auto flex min-h-[100dvh] max-w-[1320px] flex-col justify-end px-6 pt-28 pb-14 md:justify-center md:px-10 md:pb-24">
        <div className="max-w-[700px]">
          <motion.h1 {...rise(0.15)} className="display text-[clamp(3.4rem,7.4vw,6rem)] text-ink">
            It does the work.
            <br />
            <span className="text-manila">Then it proves it.</span>
          </motion.h1>

          <motion.p {...rise(0.3)} className="mt-7 max-w-[46ch] text-[18px] leading-[1.6] text-ink-2">
            Give Praxis a task in plain language. It plans it, does it in your real systems, recovers
            when they misbehave, and checks the result through a different route before telling you
            it&rsquo;s done.
          </motion.p>

          <motion.div {...rise(0.45)} className="mt-9 flex flex-wrap items-center gap-3">
            <ButtonLink href="/mission" className="px-6 py-3.5 text-[16px]">
              Open a case
              <ArrowRight className="size-4" strokeWidth={2.4} />
            </ButtonLink>
            <ButtonLink href="#case-file" tone="quiet">
              See a real run
            </ButtonLink>
          </motion.div>

          <motion.p {...rise(0.6)} className="mt-10 max-w-[52ch] text-[13px] leading-relaxed text-ink-3">
            On the table: the evidence from run{" "}
            <span className="data text-ink-2">{RECORDED_RUN.id}</span>, which entered an Acme invoice
            into a synthetic ERP in {RECORDED_RUN.durationLabel}. Sandbox company, sandbox data.
          </motion.p>
        </div>
      </div>
    </section>
    </MotionConfig>
  );
}
