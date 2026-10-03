import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/* -------------------------------------------------------------------------- */
/* Exhibit tag: the kraft label tied to every piece of evidence               */
/* -------------------------------------------------------------------------- */

export function ExhibitTag({
  exhibit,
  children,
  tone = "kraft",
  className,
}: {
  exhibit: string;
  children?: ReactNode;
  tone?: "kraft" | "manila" | "tape" | "seal" | "oxide";
  className?: string;
}) {
  const tones = {
    kraft: "bg-kraft text-kraft-ink",
    manila: "bg-manila text-kraft-ink",
    tape: "bg-tape text-tape-ink",
    seal: "bg-seal text-[#0d2418]",
    oxide: "bg-oxide text-[#2a0d07]",
  } as const;

  return (
    <span
      className={cn(
        "paper relative inline-flex items-center gap-2 py-1 pr-2.5 pl-6 text-[13px] leading-none shadow-[0_6px_14px_-8px_rgb(0_0_0/0.8)]",
        tones[tone],
        className,
      )}
      style={{
        clipPath: "polygon(10px 0, 100% 0, 100% 100%, 10px 100%, 0 50%)",
      }}
    >
      <span
        aria-hidden
        className="absolute top-1/2 left-[9px] size-[7px] -translate-y-1/2 rounded-full bg-room shadow-[inset_0_1px_1px_rgb(0_0_0/0.6)]"
      />
      <span className="font-[family-name:var(--font-stencil)] text-[15px] font-black tracking-wide">
        {exhibit}
      </span>
      {children ? <span className="font-medium">{children}</span> : null}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Seal: the verdict, stamped                                                 */
/* -------------------------------------------------------------------------- */

export type SealState = "verified" | "failed" | "pending" | "needs-you";

export function Seal({
  state,
  size = 132,
  className,
  label,
  onPaper = false,
}: {
  state: SealState;
  size?: number;
  className?: string;
  label?: string;
  /** Stamped onto manila rather than the dark room: needs a deeper ink to hold contrast. */
  onPaper?: boolean;
}) {
  const copy = {
    verified: { word: "Verified", ring: "Checked independently" },
    failed: { word: "Not done", ring: "Verification refused" },
    pending: { word: "Working", ring: "Evidence being gathered" },
    "needs-you": { word: "Needs you", ring: "Waiting on a human" },
  }[state];

  const colour = (
    onPaper
      ? { verified: "#2d7a52", failed: "#b23a26", pending: "var(--color-kraft-ink-2)", "needs-you": "#9a6a00" }
      : {
          verified: "var(--color-seal)",
          failed: "var(--color-oxide)",
          pending: "var(--color-ink-3)",
          "needs-you": "var(--color-tape)",
        }
  )[state];

  const id = `seal-${state}`;

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role="img"
      aria-label={label ?? `${copy.word}. ${copy.ring}.`}
      className={cn("-rotate-[9deg] select-none", className)}
      style={{ color: colour, filter: "url(#seal-rough)" }}
    >
      <defs>
        <path id={id} d="M100,100 m-72,0 a72,72 0 1,1 144,0 a72,72 0 1,1 -144,0" />
        <filter id="seal-rough">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" />
        </filter>
      </defs>
      <circle cx="100" cy="100" r="94" fill="none" stroke="currentColor" strokeWidth="5" />
      <circle cx="100" cy="100" r="58" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <text
        fill="currentColor"
        style={{ font: "700 15px var(--font-sans)", letterSpacing: "0.22em", textTransform: "uppercase" }}
      >
        <textPath href={`#${id}`} startOffset="0">
          {copy.ring} · Praxis ·
        </textPath>
      </text>
      <text
        x="100"
        y="112"
        textAnchor="middle"
        fill="currentColor"
        style={{ font: "900 34px var(--font-stencil)", letterSpacing: "0.02em", textTransform: "uppercase" }}
      >
        {copy.word}
      </text>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Buttons                                                                    */
/* -------------------------------------------------------------------------- */

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-tag)] px-5 py-3 text-[15px] font-semibold transition-[transform,background-color,box-shadow,color] duration-300 ease-[var(--ease-out-expo)] disabled:cursor-not-allowed disabled:opacity-45 active:translate-y-px";

const buttonTones = {
  primary:
    "paper bg-manila text-kraft-ink shadow-[var(--shadow-sheet)] hover:bg-[#f3e4bf] hover:-translate-y-0.5",
  quiet:
    "border border-seam-2 text-ink hover:border-ink-3 hover:bg-bench",
  tape: "bg-tape text-tape-ink hover:bg-[#ffc649] shadow-[var(--shadow-lift)]",
  danger: "border border-oxide/60 text-oxide hover:bg-oxide-deep/60",
} as const;

export function Button({
  tone = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { tone?: keyof typeof buttonTones }) {
  return <button className={cn(buttonBase, buttonTones[tone], className)} {...props} />;
}

export function ButtonLink({
  tone = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { tone?: keyof typeof buttonTones }) {
  return <Link className={cn(buttonBase, buttonTones[tone], className)} {...props} />;
}

/* -------------------------------------------------------------------------- */
/* Wordmark                                                                   */
/* -------------------------------------------------------------------------- */

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden>
        <path
          d="M6 4h14l6 6v18H6z"
          fill="var(--color-manila)"
          stroke="var(--color-kraft-ink)"
          strokeWidth="1.5"
        />
        <path d="M20 4v6h6" fill="var(--color-manila-2)" stroke="var(--color-kraft-ink)" strokeWidth="1.5" />
        <circle cx="16" cy="19" r="5.5" fill="none" stroke="var(--color-seal-deep)" strokeWidth="2" />
        <path d="M13.6 19.2l1.7 1.7 3.2-3.6" fill="none" stroke="var(--color-seal-deep)" strokeWidth="2" />
      </svg>
      <span className="display text-[26px] tracking-[0.02em]">Praxis</span>
    </span>
  );
}
