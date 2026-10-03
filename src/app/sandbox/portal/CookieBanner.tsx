"use client";

import { useEffect, useState } from "react";

/**
 * A consent banner that genuinely blocks interaction with the page until it is
 * dismissed. Every fresh browser context sees it, so the agent has to notice
 * an overlay is in the way and clear it before it can get any work done. This
 * is the single most common real-world reason naive browser automation fails.
 */
export function CookieBanner() {
  const [accepted, setAccepted] = useState(true);

  useEffect(() => {
    setAccepted(window.localStorage.getItem("nw_cookie_consent") === "yes");
  }, []);

  if (accepted) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-2xl rounded border border-slate-300 bg-white p-5 shadow-xl">
        <h2 className="text-sm font-semibold">We use cookies</h2>
        <p className="mt-2 text-sm text-slate-600">
          This portal uses strictly necessary cookies to keep you signed in. You must accept to
          continue using the invoice portal.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              window.localStorage.setItem("nw_cookie_consent", "yes");
              setAccepted(true);
            }}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Accept all cookies
          </button>
          <a
            href="https://example.com/cookie-policy"
            className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Cookie policy
          </a>
        </div>
      </div>
    </div>
  );
}
