"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Dot, PenLine, RotateCcw, X } from "lucide-react";
import { ExhibitTag, Seal } from "@/components/evidence";
import { RECORDED_RUN } from "@/lib/recorded-run";
import { cn } from "@/lib/cn";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const BEATS = [
  {
    title: "You say what you want",
    body: "One sentence, the way you would hand it to a colleague. No steps, no selectors, no workflow builder.",
  },
  {
    title: "It turns that into exhibits",
    body: "Each step gets a test that something observable must pass. The agent decides the clicks; the test decides whether it worked.",
  },
  {
    title: "It does the work, and trips",
    body: "It opened the wrong invoice. A separate reviewer caught it. The document service failed. It read the error and tried again.",
  },
  {
    title: "It proves it another way",
    body: "The bill was entered through a web form, so it is checked through the API. A confirmation screen is not evidence.",
  },
];

const trailTone = {
  act: "text-ink-2",
  review: "text-tape",
  fail: "text-oxide",
  fact: "text-seal",
} as const;

const trailMark = { act: Dot, review: RotateCcw, fail: X, fact: PenLine } as const;

export function CaseFileStory() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add("(min-width: 900px) and (prefers-reduced-motion: no-preference)", () => {
        const q = gsap.utils.selector(root);
        const beats = q("[data-beat]");
        root.current?.setAttribute("data-pinned", "");
        gsap.set(beats.slice(1), { autoAlpha: 0, y: 28, filter: "blur(8px)" });
        gsap.set(q("[data-reveal]"), { autoAlpha: 0, y: 14 });
        gsap.set(q("[data-seal]"), { autoAlpha: 0, scale: 1.8, rotate: -24 });

        const tl = gsap.timeline({
          defaults: { ease: "expo.out", duration: 0.6 },
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: "+=320%",
            pin: true,
            scrub: 0.6,
          },
        });

        const swap = (from: number, to: number, at: number) => {
          tl.to(beats[from], { autoAlpha: 0, y: -24, filter: "blur(8px)", duration: 0.4 }, at).to(
            beats[to],
            { autoAlpha: 1, y: 0, filter: "blur(0px)" },
            at + 0.25,
          );
        };

        tl.to(q("[data-reveal='goal']"), { autoAlpha: 1, y: 0 }, 0.1);
        swap(0, 1, 0.9);
        tl.to(q("[data-reveal='exhibit']"), { autoAlpha: 1, y: 0, stagger: 0.18 }, 1.2);
        swap(1, 2, 2.2);
        tl.to(q("[data-reveal='trail']"), { autoAlpha: 1, y: 0, stagger: 0.11 }, 2.4);
        swap(2, 3, 4.0);
        tl.to(q("[data-reveal='check']"), { autoAlpha: 1, y: 0, stagger: 0.14 }, 4.2).to(
          q("[data-seal]"),
          { autoAlpha: 1, scale: 1, rotate: -9, duration: 0.35, ease: "power4.in" },
          4.7,
        );
        tl.to({}, { duration: 0.6 });

        return () => root.current?.removeAttribute("data-pinned");
      });

      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section
      id="case-file"
      ref={root}
      className="group/story relative border-t border-seam/60 bg-room-2 data-[pinned]:h-[100dvh]"
    >
      <div className="mx-auto grid h-full max-w-[1320px] gap-12 px-6 py-20 md:px-10 min-[900px]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] min-[900px]:items-center group-data-[pinned]/story:py-0">
        {/* Beats */}
        <div className="relative group-data-[pinned]/story:h-[300px]">
          {BEATS.map((beat, i) => (
            <div
              key={beat.title}
              data-beat
              className="mb-12 group-data-[pinned]/story:absolute group-data-[pinned]/story:inset-x-0 group-data-[pinned]/story:top-0 group-data-[pinned]/story:mb-0"
            >
              <h2 className="display text-[clamp(2.6rem,4.6vw,4.4rem)] text-ink">{beat.title}</h2>
              <p className="mt-5 max-w-[42ch] text-[17px] leading-[1.65] text-ink-2">{beat.body}</p>
              <p className="data mt-6 text-[12px] text-ink-3">
                {String(i + 1)}/{BEATS.length}
              </p>
            </div>
          ))}
        </div>

        {/* Case file */}
        <div className="relative">
          <div className="paper relative rounded-[var(--radius-bench)] bg-manila p-6 text-kraft-ink shadow-[var(--shadow-sheet)] md:px-8 md:py-6">
            <div
              aria-hidden
              className="absolute -top-5 left-8 h-6 w-44 rounded-t-[6px] bg-manila-2"
            />
            <div className="flex items-baseline justify-between gap-4 border-b border-kraft-ink/20 pb-3">
              <p className="font-[family-name:var(--font-stencil)] text-[22px] font-black tracking-wide">
                Case {RECORDED_RUN.id}
              </p>
              <p className="data text-[12px] text-kraft-ink-2">
                {RECORDED_RUN.actions} actions · {RECORDED_RUN.durationLabel}
              </p>
            </div>

            <p data-reveal="goal" className="mt-4 text-[16px] leading-normal font-medium">
              &ldquo;{RECORDED_RUN.goal}&rdquo;
            </p>

            <ol className="mt-4 space-y-2">
              {RECORDED_RUN.steps.map((s) => (
                <li key={s.id} data-reveal="exhibit" className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
                  <ExhibitTag exhibit={`Exhibit ${s.id}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold leading-snug">{s.title}</p>
                    <p className="text-[13px] leading-snug text-kraft-ink-2">Passes when: {s.criterion}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-4 rounded-[6px] bg-room px-4 py-3 shadow-[inset_0_2px_8px_rgb(0_0_0/0.5)]">
              <ul className="data space-y-1 text-[12px] leading-snug">
                {RECORDED_RUN.trail.map((t, i) => {
                  const Mark = trailMark[t.kind];
                  return (
                    <li key={i} data-reveal="trail" className={cn("flex gap-2.5", trailTone[t.kind])}>
                      <Mark aria-hidden className="mt-px size-3.5 shrink-0" strokeWidth={2.2} />
                      <span>{t.text}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="mt-4 flex items-center gap-6 max-sm:flex-col max-sm:items-start">
              <ul className="grid min-w-0 flex-1 gap-1.5">
                {RECORDED_RUN.verdict.checks.map((c) => (
                  <li key={c.label} data-reveal="check" className="text-[14px] leading-snug">
                    <span className="font-semibold">{c.label}.</span>{" "}
                    <span className="data text-[12px] text-kraft-ink-2">{c.evidence}</span>
                  </li>
                ))}
              </ul>
              <div data-seal className="shrink-0">
                <Seal state="verified" size={124} onPaper />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
