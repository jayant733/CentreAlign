"use client";

import { useRef } from "react";
import { X } from "lucide-react";
import type { Artifact } from "@/agent/types";
import { cn } from "@/lib/cn";

/** A screenshot that opens full size in a native dialog. */
export function Shot({ artifact, className }: { artifact: Artifact; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  if (!artifact.url) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className={cn(
          "group relative block overflow-hidden rounded-[4px] bg-room ring-1 ring-seam transition-[box-shadow] hover:ring-ink-3",
          className,
        )}
        aria-label={`Open screenshot: ${artifact.label}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- run artifacts are local files of unknown size */}
        <img src={artifact.url} alt="" loading="lazy" className="h-full w-full object-cover object-top" />
      </button>
      <dialog
        ref={dialog}
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
        className="m-auto max-h-[92dvh] max-w-[min(1280px,94vw)] overflow-visible bg-transparent p-0 backdrop:bg-black/75 backdrop:backdrop-blur-sm"
      >
        <figure className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={artifact.url}
            alt={artifact.label}
            className="max-h-[86dvh] w-auto rounded-[6px] shadow-[var(--shadow-sheet)]"
          />
          <figcaption className="mt-3 text-[14px] text-ink-2">{artifact.label}</figcaption>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="absolute -top-3 -right-3 grid size-9 place-items-center rounded-full bg-bench text-ink ring-1 ring-seam-2 hover:bg-bench-2"
            aria-label="Close screenshot"
          >
            <X className="size-4" />
          </button>
        </figure>
      </dialog>
    </>
  );
}
