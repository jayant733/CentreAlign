import type { Browser, BrowserContext, Page } from "playwright";
import { config } from "./config";
import type { BrowserSessionHandle } from "./types";

/**
 * Browser session plus the page-observation pipeline.
 *
 * The important part of this file is `observe`. Handing a model raw HTML does
 * not work: a single page of this sandbox is ~40k characters of markup, which
 * is expensive, mostly irrelevant, and invites the model to invent CSS
 * selectors that do not exist. Instead every observation is reduced to
 *
 *   1. a numbered list of the *visible, interactive* elements, and
 *   2. the page's rendered text.
 *
 * Tools then address elements by number. The model never writes a selector, so
 * it cannot write a wrong one — the worst it can do is pick an index that is
 * on the page but not the one it wanted, which is a recoverable mistake the
 * critic can catch.
 */

export interface ObservedElement {
  index: number;
  tag: string;
  role: string;
  label: string;
  detail?: string;
  disabled?: boolean;
}

export interface Observation {
  url: string;
  title: string;
  elements: ObservedElement[];
  text: string;
  /** Set when something is covering the page, e.g. a consent dialog. */
  overlay: string | null;
}

export class BrowserSession implements BrowserSessionHandle {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private current: Page | null = null;

  async page(): Promise<Page> {
    if (this.current && !this.current.isClosed()) return this.current;

    const { chromium } = await import("playwright");
    this.browser ??= await chromium.launch({
      headless: config.browser.headless,
      args: ["--disable-blink-features=AutomationControlled"],
    });
    this.context ??= await this.browser.newContext({
      viewport: config.browser.viewport,
      acceptDownloads: true,
    });
    this.context.setDefaultTimeout(config.browser.actionTimeoutMs);
    this.context.setDefaultNavigationTimeout(config.browser.navigationTimeoutMs);

    this.current = await this.context.newPage();
    return this.current;
  }

  isOpen(): boolean {
    return this.current !== null && !this.current.isClosed();
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => {});
    await this.browser?.close().catch(() => {});
    this.context = null;
    this.browser = null;
    this.current = null;
  }
}

/** Locator for an element index from the most recent observation. */
export function elementLocator(page: Page, index: number) {
  return page.locator(`[data-praxis-id="${index}"]`);
}

/**
 * Runs in the page. Tags every visible interactive element with a stable
 * `data-praxis-id` for this snapshot and reports the page's text.
 */
/* eslint-disable */
function collect() {
  const SELECTOR = [
    "a[href]",
    "button",
    'input:not([type="hidden"])',
    "select",
    "textarea",
    '[role="button"]',
    '[role="link"]',
    '[role="tab"]',
    '[role="checkbox"]',
    "summary",
    '[contenteditable="true"]',
  ].join(",");

  document.querySelectorAll("[data-praxis-id]").forEach((el) => el.removeAttribute("data-praxis-id"));

  const labelFor = (el: Element): string => {
    const anyEl = el as any;
    const aria = el.getAttribute("aria-label");
    if (aria?.trim()) return aria.trim();
    if (anyEl.labels?.length) {
      const t = (anyEl.labels[0] as HTMLElement).innerText;
      if (t?.trim()) return t.trim();
    }
    const labelled = el.getAttribute("aria-labelledby");
    if (labelled) {
      const t = document.getElementById(labelled)?.innerText;
      if (t?.trim()) return t.trim();
    }
    const own = (el as HTMLElement).innerText;
    if (own?.trim()) return own.trim().replace(/\s+/g, " ").slice(0, 120);
    for (const attr of ["placeholder", "title", "alt", "value", "name"]) {
      const v = el.getAttribute(attr);
      if (v?.trim()) return v.trim().slice(0, 120);
    }
    return "";
  };

  const elements: Array<{
    index: number;
    tag: string;
    role: string;
    label: string;
    detail?: string;
    disabled?: boolean;
  }> = [];

  let index = 0;
  for (const el of Array.from(document.querySelectorAll(SELECTOR))) {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const visible =
      rect.width > 1 &&
      rect.height > 1 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      Number(style.opacity || "1") > 0.05;
    if (!visible) continue;

    index += 1;
    el.setAttribute("data-praxis-id", String(index));

    const tag = el.tagName.toLowerCase();
    const anyEl = el as any;
    let role = tag;
    let detail: string | undefined;

    if (tag === "a") {
      role = "link";
      const href = el.getAttribute("href") ?? "";
      detail = href ? `href=${href}` : undefined;
    } else if (tag === "input") {
      const type = (el.getAttribute("type") ?? "text").toLowerCase();
      role = `input:${type}`;
      const parts: string[] = [];
      if (el.getAttribute("name")) parts.push(`name=${el.getAttribute("name")}`);
      if (anyEl.value) parts.push(`current="${String(anyEl.value).slice(0, 60)}"`);
      if (el.getAttribute("placeholder")) parts.push(`placeholder="${el.getAttribute("placeholder")}"`);
      detail = parts.join(" ") || undefined;
    } else if (tag === "select") {
      role = "select";
      const opts = Array.from(anyEl.options ?? [])
        .map((o: any) => String(o.value ?? ""))
        .filter((v: string) => v !== "")
        .slice(0, 12);
      const parts = [`name=${el.getAttribute("name") ?? ""}`];
      if (anyEl.value) parts.push(`current="${anyEl.value}"`);
      if (opts.length) parts.push(`options=[${opts.map((o) => `"${o}"`).join(", ")}]`);
      detail = parts.join(" ");
    } else if (tag === "textarea") {
      role = "textarea";
      detail = `name=${el.getAttribute("name") ?? ""}`;
    } else if (tag === "button" || el.getAttribute("role") === "button") {
      role = "button";
      const type = el.getAttribute("type");
      if (type) detail = `type=${type}`;
    }

    elements.push({
      index,
      tag,
      role,
      label: labelFor(el),
      detail,
      disabled: anyEl.disabled === true || el.getAttribute("aria-disabled") === "true",
    });
  }

  // Anything fixed, large and stacked above the content is in the way.
  let overlay: string | null = null;
  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    const style = window.getComputedStyle(el);
    if (style.position !== "fixed" && style.position !== "sticky") continue;
    if (style.visibility === "hidden" || style.display === "none") continue;
    const rect = el.getBoundingClientRect();
    const coverage = (rect.width * rect.height) / (window.innerWidth * window.innerHeight);
    const z = Number(style.zIndex || "0");
    if (coverage > 0.4 && z >= 10) {
      const text = (el as HTMLElement).innerText?.trim().replace(/\s+/g, " ").slice(0, 200) ?? "";
      overlay = text || "an unlabelled fixed overlay";
      break;
    }
  }

  const text = (document.body as HTMLElement).innerText ?? "";

  return {
    url: location.href,
    title: document.title,
    elements,
    text,
    overlay,
  };
}
/* eslint-enable */

const MAX_TEXT = 6000;

export async function observe(page: Page): Promise<Observation> {
  // `domcontentloaded` rather than `networkidle`: this app streams, and
  // waiting for idle hangs on pages that keep a connection open.
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  // Sent as source text with a no-op `__name`: esbuild (used by tsx and the
  // Next dev server) wraps functions in a `__name()` helper that exists in
  // Node but not in the page, so passing `collect` directly throws there.
  const raw = (await page.evaluate(
    `(() => { const __name = (f) => f; return (${collect.toString()})(); })()`,
  )) as ReturnType<typeof collect>;

  let text = raw.text.replace(/\t/g, " | ").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length > MAX_TEXT) {
    text = `${text.slice(0, MAX_TEXT)}\n…[page text truncated at ${MAX_TEXT} characters]`;
  }

  return { ...raw, text };
}

/** Renders an observation into the block the model actually reads. */
export function renderObservation(obs: Observation): string {
  const lines: string[] = [];
  lines.push(`URL: ${obs.url}`);
  lines.push(`PAGE TITLE: ${obs.title || "(untitled)"}`);

  if (obs.overlay) {
    lines.push(
      "",
      `WARNING: an overlay is covering the page and will block clicks until it is dismissed. ` +
        `Overlay text: "${obs.overlay}"`,
    );
  }

  lines.push("", "INTERACTIVE ELEMENTS (address these by index):");
  if (obs.elements.length === 0) {
    lines.push("  (none found)");
  }
  for (const el of obs.elements) {
    const bits = [`[${el.index}]`, el.role];
    if (el.label) bits.push(`"${el.label}"`);
    if (el.detail) bits.push(el.detail);
    if (el.disabled) bits.push("(disabled)");
    lines.push(`  ${bits.join(" ")}`);
  }

  lines.push("", "PAGE TEXT:", obs.text || "(empty)");
  return lines.join("\n");
}
