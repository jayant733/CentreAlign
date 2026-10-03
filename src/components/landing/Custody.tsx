/**
 * The architecture, written as a chain-of-custody log: who handled the work at
 * each stage, on what authority, and what they hand to the next. It is the
 * honest shape of the system — five separate handlers, not one prompt.
 */

const CHAIN = [
  {
    handler: "Planner",
    model: "gemini-3.8-flash",
    receives: "Your sentence, plus notes earlier runs learned about these systems",
    hands_on: "Steps, each with a test it must pass, and a plan for checking the end result",
    why: "Asks you a question only if guessing could do damage. Otherwise it starts.",
  },
  {
    handler: "Actor",
    model: "gemini-3.5-flash-lite",
    receives: "The current step, recorded facts, and the latest page reduced to numbered elements",
    hands_on: "One tool call at a time: browser, PDF, HTTP, files, or any tool an MCP server offers",
    why: "It never writes a selector, so it can never write a wrong one.",
  },
  {
    handler: "Reviewer",
    model: "gemini-3.8-flash",
    receives: "Only the step's test and the transcript of the attempt",
    hands_on: "Pass, retry with advice, replan, or escalate to you",
    why: "A separate call with no stake in the attempt. Grading your own work produces optimism.",
  },
  {
    handler: "Verifier",
    model: "gemini-3.8-flash",
    receives: "The goal and the facts recorded, treated as claims",
    hands_on: "A verdict per requirement, and the summary you read",
    why: "Goes and looks again with read-only tools, through a different route than the work took.",
  },
  {
    handler: "Notebook",
    model: "sqlite",
    receives: "The finished run",
    hands_on: "Reusable notes about how each system behaves",
    why: "The second time it meets the sort-by-number trap, it already knows.",
  },
];

export function Custody() {
  return (
    <section className="border-t border-seam/60">
      <div className="mx-auto max-w-[1320px] px-6 py-28 md:px-10 md:py-36">
        <div className="grid gap-10 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div>
            <h2 className="display text-[clamp(2.6rem,4.8vw,4.6rem)]">Chain of custody</h2>
            <p className="mt-6 max-w-[44ch] text-[17px] leading-[1.65] text-ink-2">
              Five handlers, each with one job and a narrow view. The model that does the work is
              never the one that decides whether it worked.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <caption className="sr-only">Who handles a task at each stage</caption>
              <thead>
                <tr className="border-b border-seam-2 text-[12px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
                  <th scope="col" className="py-3 pr-6 font-semibold">Handler</th>
                  <th scope="col" className="py-3 pr-6 font-semibold">Receives</th>
                  <th scope="col" className="py-3 font-semibold">Hands on</th>
                </tr>
              </thead>
              <tbody>
                {CHAIN.map((row) => (
                  <tr key={row.handler} className="group border-b border-seam/70 align-top">
                    <th scope="row" className="py-6 pr-6">
                      <span className="display block text-[30px] text-manila">{row.handler}</span>
                      <span className="data mt-1.5 block text-[12px] font-normal text-ink-3">{row.model}</span>
                    </th>
                    <td className="py-6 pr-6 text-[15px] leading-relaxed text-ink-2">{row.receives}</td>
                    <td className="py-6 text-[15px] leading-relaxed">
                      <span className="text-ink">{row.hands_on}</span>
                      <span className="mt-2 block text-[14px] text-ink-3">{row.why}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
