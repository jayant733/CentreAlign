import { config } from "@/agent/config";
import * as llm from "@/agent/llm";
import { z } from "zod";

/** Quick connectivity and capability check for the configured model. */
async function main() {
  console.log(`key: ${config.llm.apiKey ? `${config.llm.apiKey.slice(0, 8)}…` : "(missing)"}`);
  for (const [tier, spec] of Object.entries(config.llm.tiers)) {
    console.log(`${tier.padEnd(10)} ${spec.model} @ ${spec.rpm} rpm`);
  }

  const plain = await llm.text({ system: "Reply with one word.", prompt: "Say ok" });
  console.log(`text call -> ${JSON.stringify(plain)}`);

  const structured = await llm.json({
    schema: z.object({ city: z.string(), population: z.number() }),
    system: "You answer with structured data.",
    prompt: "Give me the capital of France and a rough population figure.",
  });
  console.log(`json call -> ${JSON.stringify(structured)}`);

  const chosen = await llm.act({
    system: "You pick tools.",
    prompt: "Open the vendor portal at /sandbox/portal.",
    tools: [
      {
        name: "browser_open",
        description: "Navigate to a URL.",
        risk: "safe",
        parameters: z.object({ url: z.string() }),
        async run() {
          return { ok: true, observation: "" };
        },
      },
    ],
  });
  console.log(`tool call -> ${JSON.stringify(chosen)}`);
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
