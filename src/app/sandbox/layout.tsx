import type { ReactNode } from "react";

/**
 * The sandbox apps intentionally look like plain, slightly dated internal
 * tooling. They are the environment the agent operates in, not part of the
 * Praxis product surface, and keeping them visually boring makes demo videos
 * unambiguous about which window is which.
 */
export default function SandboxLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="bg-amber-400 px-4 py-1 text-center text-[11px] font-semibold uppercase tracking-wider text-amber-950">
        Sandbox environment &mdash; synthetic data, no real systems or credentials
      </div>
      {children}
    </div>
  );
}
