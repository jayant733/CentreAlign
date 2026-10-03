import { z } from "zod";
import type { Page } from "playwright";
import { elementLocator, observe, renderObservation } from "../browser";
import { config } from "../config";
import type { ToolContext, ToolDefinition, ToolResult } from "../types";
import { classify, isRetryable } from "./registry";

/**
 * Browser tools.
 *
 * Two conventions hold across all of them:
 *
 *  - every tool that changes the page returns a *fresh* observation, so the
 *    agent's next decision is based on the state it actually caused rather
 *    than on what it hoped would happen;
 *  - a screenshot is captured after each page-changing action and attached as
 *    an artifact, which is both the evidence trail for the final report and
 *    the thing that makes a failed run possible to debug.
 */

async function snapshot(page: Page, ctx: ToolContext, label: string) {
  const obs = await observe(page);
  let shot;
  try {
    const bytes = await page.screenshot({ type: "jpeg", quality: 62 });
    shot = ctx.saveArtifact("screenshot", label, bytes, "jpg");
  } catch {
    // A screenshot failure must never fail the action it was documenting.
  }
  return { obs, shot };
}

function result(
  rendered: string,
  prefix: string,
  shot: ReturnType<ToolContext["saveArtifact"]> | undefined,
  data?: unknown,
): ToolResult {
  return {
    ok: true,
    observation: `${prefix}\n\n${rendered}`,
    data,
    artifacts: shot ? [shot] : undefined,
  };
}

function failure(message: string): ToolResult {
  return {
    ok: false,
    observation: message,
    error: { kind: classify(message), message, retryable: isRetryable(message) },
  };
}

export const browserTools: ToolDefinition[] = [
  {
    name: "browser_open",
    description:
      "Navigate the browser to a URL and return what is on the resulting page. Use this to start " +
      "work on a site, or to jump directly to a known URL. Relative URLs are resolved against " +
      "the company's base URL.",
    risk: "safe",
    parameters: z.object({
      url: z.string().min(1).describe("Absolute URL, or a path such as /sandbox/portal"),
    }),
    async run({ url }, ctx) {
      const page = await ctx.browser.page();
      const target = url.startsWith("http") ? url : new URL(url, config.baseUrl).toString();
      const response = await page.goto(target, { waitUntil: "domcontentloaded" });
      const status = response?.status() ?? 0;

      const { obs, shot } = await snapshot(page, ctx, `Opened ${target}`);

      if (status >= 400) {
        return {
          ok: false,
          observation:
            `Navigating to ${target} returned HTTP ${status}. The page content was:\n\n` +
            renderObservation(obs),
          error: {
            kind: status >= 500 ? "server_error" : status === 404 ? "not_found" : "auth",
            message: `HTTP ${status} from ${target}`,
            retryable: status >= 500 || status === 429,
          },
          artifacts: shot ? [shot] : undefined,
        };
      }

      return result(renderObservation(obs), `Navigated to ${target} (HTTP ${status}).`, shot, {
        url: obs.url,
        status,
      });
    },
  },

  {
    name: "browser_read",
    description:
      "Re-read the current page without changing anything. Use it to refresh element indexes " +
      "after the page has changed on its own, or to look again before deciding.",
    risk: "safe",
    parameters: z.object({}),
    async run(_args, ctx) {
      const page = await ctx.browser.page();
      const { obs, shot } = await snapshot(page, ctx, "Read current page");
      return result(renderObservation(obs), "Current page state:", shot, { url: obs.url });
    },
  },

  {
    name: "browser_click",
    description:
      "Click an interactive element by the index shown in the most recent observation. Indexes " +
      "are only valid for the latest observation; if the page has changed since, read it again " +
      "first.",
    risk: "write",
    parameters: z.object({
      index: z.number().int().positive().describe("Element index from the latest observation"),
    }),
    async run({ index }, ctx) {
      const page = await ctx.browser.page();
      const locator = elementLocator(page, index);
      if ((await locator.count()) === 0) {
        return failure(
          `No element with index ${index} exists on the current page. The indexes may be stale — ` +
            `call browser_read to get a fresh list.`,
        );
      }

      const describe = (await locator.first().innerText().catch(() => "")).trim().slice(0, 80);
      const before = page.url();

      await locator.first().click({ timeout: config.browser.actionTimeoutMs });
      // Give a navigation or client-side re-render a chance to settle before
      // observing, otherwise the agent sees the pre-click page and concludes
      // the click did nothing.
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(250);

      const { obs, shot } = await snapshot(page, ctx, `Clicked [${index}] ${describe}`);
      const navigated = before !== obs.url;

      return result(
        renderObservation(obs),
        `Clicked element [${index}]${describe ? ` ("${describe}")` : ""}. ` +
          (navigated ? `The page navigated to ${obs.url}.` : "The URL did not change."),
        shot,
        { navigated, url: obs.url },
      );
    },
  },

  {
    name: "browser_fill",
    description:
      "Type a value into a text input or textarea, replacing anything already there. The value " +
      "is entered exactly as given, so normalise it first if the field is strict about format.",
    risk: "write",
    parameters: z.object({
      index: z.number().int().positive(),
      value: z.string().describe("Exact text to enter"),
    }),
    async run({ index, value }, ctx) {
      const page = await ctx.browser.page();
      const locator = elementLocator(page, index);
      if ((await locator.count()) === 0) {
        return failure(`No element with index ${index} on the current page. Call browser_read.`);
      }

      await locator.first().fill(value, { timeout: config.browser.actionTimeoutMs });
      const { obs, shot } = await snapshot(page, ctx, `Filled [${index}]`);
      return result(renderObservation(obs), `Entered "${value}" into element [${index}].`, shot);
    },
  },

  {
    name: "browser_select",
    description:
      "Choose an option in a dropdown. The value must be one of the options listed for that " +
      "element in the observation.",
    risk: "write",
    parameters: z.object({
      index: z.number().int().positive(),
      value: z.string().describe("Exact option value"),
    }),
    async run({ index, value }, ctx) {
      const page = await ctx.browser.page();
      const locator = elementLocator(page, index);
      if ((await locator.count()) === 0) {
        return failure(`No element with index ${index} on the current page. Call browser_read.`);
      }

      try {
        await locator.first().selectOption(value, { timeout: config.browser.actionTimeoutMs });
      } catch {
        // Fall back to matching on the visible label, which is what the model
        // tends to reach for when value and label differ.
        await locator.first().selectOption({ label: value }, { timeout: config.browser.actionTimeoutMs });
      }

      const { obs, shot } = await snapshot(page, ctx, `Selected "${value}" in [${index}]`);
      return result(renderObservation(obs), `Selected "${value}" in dropdown [${index}].`, shot);
    },
  },

  {
    name: "browser_press",
    description:
      "Press a keyboard key, for example Enter to submit a focused form or Escape to close a " +
      "dialog.",
    risk: "write",
    parameters: z.object({
      key: z.string().describe("Playwright key name, e.g. Enter, Escape, Tab"),
    }),
    async run({ key }, ctx) {
      const page = await ctx.browser.page();
      await page.keyboard.press(key);
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(250);
      const { obs, shot } = await snapshot(page, ctx, `Pressed ${key}`);
      return result(renderObservation(obs), `Pressed ${key}.`, shot);
    },
  },

  {
    name: "browser_back",
    description: "Go back to the previous page in browser history.",
    risk: "safe",
    parameters: z.object({}),
    async run(_args, ctx) {
      const page = await ctx.browser.page();
      await page.goBack({ waitUntil: "domcontentloaded" });
      const { obs, shot } = await snapshot(page, ctx, "Navigated back");
      return result(renderObservation(obs), `Went back. Now at ${obs.url}.`, shot);
    },
  },

  {
    name: "browser_scroll",
    description:
      "Scroll the page when the observation says the text was truncated or content you expect " +
      "is not visible.",
    risk: "safe",
    parameters: z.object({
      direction: z.enum(["down", "up", "top", "bottom"]),
    }),
    async run({ direction }, ctx) {
      const page = await ctx.browser.page();
      await page.evaluate((dir: string) => {
        const h = window.innerHeight * 0.8;
        if (dir === "down") window.scrollBy(0, h);
        else if (dir === "up") window.scrollBy(0, -h);
        else if (dir === "top") window.scrollTo(0, 0);
        else window.scrollTo(0, document.body.scrollHeight);
      }, direction);
      await page.waitForTimeout(200);
      const { obs, shot } = await snapshot(page, ctx, `Scrolled ${direction}`);
      return result(renderObservation(obs), `Scrolled ${direction}.`, shot);
    },
  },
];
