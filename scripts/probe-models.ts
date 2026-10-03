import { FunctionCallingConfigMode, GoogleGenAI } from "@google/genai";
import { config } from "@/agent/config";

/**
 * Finds a model that can do forced tool calling and is not rate-limited into
 * uselessness. The free tier differs wildly per model (5 rpm on the flagship,
 * much more on the lite tiers), and the agent makes tens of calls per run, so
 * picking the right one is a correctness issue, not an optimisation.
 */
const CANDIDATES = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
];

async function main() {
  const ai = new GoogleGenAI({ apiKey: config.llm.apiKey });

  for (const model of CANDIDATES) {
    const started = Date.now();
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: "Open the vendor portal at /sandbox/portal." }] }],
        config: {
          systemInstruction: "You pick exactly one tool.",
          temperature: 0,
          tools: [
            {
              functionDeclarations: [
                {
                  name: "browser_open",
                  description: "Navigate to a URL.",
                  parametersJsonSchema: {
                    type: "object",
                    properties: { url: { type: "string" }, rationale: { type: "string" } },
                    required: ["url", "rationale"],
                  },
                },
              ],
            },
          ],
          toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } },
        },
      });
      const call = res.functionCalls?.[0];
      const ms = Date.now() - started;
      console.log(
        `OK    ${model.padEnd(26)} ${String(ms).padStart(5)}ms  ${call ? JSON.stringify(call.args) : "NO CALL"}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const rpm = /quotaValue":"(\d+)"/.exec(message)?.[1];
      const short = /"message":"([^"]{0,110})/.exec(message)?.[1] ?? message.slice(0, 110);
      console.log(`FAIL  ${model.padEnd(26)} ${rpm ? `rpm=${rpm} ` : ""}${short}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
