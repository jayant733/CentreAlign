# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, both confirmed:

- **Evaluators** of a hackathon submission (CentreAlign AI, "Autonomous AI Task Worker"), who watch a demo video or a live walkthrough and judge autonomy, execution, reliability, verification, generalisation, engineering quality and product thinking.
- **Operations / finance staff** (the persona is an accounts-payable clerk at "Northwind Manufacturing") who hand the worker a plain-language task and need to trust what it did without re-doing it.

The UI must read as a real tool an operator would use daily, while making the agent's autonomy legible at a glance for someone watching for the first time.

## Product Purpose

Praxis takes a natural-language task, plans it into steps with checkable success criteria, executes it itself in a real browser and real APIs, recovers from failures, independently verifies the outcome, and returns a short summary with evidence. Success means the user's actual objective is achieved and proven, not that steps were performed.

## Positioning

The mechanism a neighbouring "agent demo" cannot truthfully copy: every step is judged by a separate critic against its success criterion, and the final result is verified through a different route than the one used to do the work (UI write, API read-back). The agent is told only which systems exist, not their quirks, and learns those as reusable operating notes across runs.

## Operating Context

- Sandbox company: Northwind Manufacturing. Systems: Vendor Invoice Portal (`/sandbox/portal`, login, consent overlay, paging, PDFs) and NimbusERP accounts payable (`/sandbox/erp`, strict bill form, read-only REST API, payments endpoint).
- Runs are enqueued by the web API and executed by a separate worker process; all state is in SQLite, streamed to the UI.
- Human-in-the-loop: approvals for dangerous actions (payments) and clarifying questions arrive as interventions the UI must answer.
- Headline demo task: "Find the latest invoice from Acme, extract the total amount payable and the due date, enter it into NimbusERP, and tell me once it is done." First verified run: 3/3 steps, 34 actions, ~3.7 min, bill BILL-0013 for INV-ACM-2012, $18,415.49, due 2026-10-22.

## Capabilities and Constraints

- Real: planner, actor loop, critic, verifier with independent evidence gathering, cross-run recipe memory, approval gate, MCP client, loop guard, model fallback chain and per-model pacing.
- Models: Gemini (free tier). Measured limits: 5 rpm on flash models, 15 rpm on lite. Runs take minutes, so the UI must make waiting and progress legible.
- Stack: Next.js 16 App Router, React 19, Tailwind v4, Three.js via React Three Fiber, GSAP, Motion (Framer Motion). User-pinned.
- Deadline: October 4, 2026, 5:30 PM IST.

## Brand Commitments

- Name: **Praxis** (doing, not explaining).
- User-pinned visual constraint: a "3D Blender render" look, GSAP and Framer Motion animation. Recorded as binding; interpretation belongs to new-work.

## Evidence on Hand

- Real run traces, step outcomes, critic verdicts, recorded facts and per-action screenshots in `.data/praxis.db` and `public/artifacts/<runId>/`.
- No customers, testimonials, benchmarks or pricing exist. Do not fabricate any. Sandbox data is synthetic and must be labelled so.

## Product Principles

1. Show the work, not a claim about the work: every assertion in the UI points at an artifact, a fact, or a verdict.
2. Autonomy must be legible: plan, current step, and why the agent took each action are always visible.
3. Failure is a first-class state, not an error toast: retries, replans and escalations are shown as part of the story.
4. A human decision is never buried: pending approvals and questions take precedence over everything else on screen.
5. Honest about limits: synthetic data and sandbox systems are labelled.

## Accessibility & Inclusion

No specific requirement established. Default to WCAG AA contrast, keyboard operability, and `prefers-reduced-motion` support for all 3D and scroll animation.
