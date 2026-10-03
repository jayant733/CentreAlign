---
name: Praxis
description: The evidence room. A case file for work an AI worker did and then proved.
colors:
  room: "#15120e"
  room-2: "#1c1813"
  bench: "#241f18"
  bench-2: "#2e281f"
  seam: "#3b3429"
  seam-2: "#4c4335"
  ink: "#f1eadc"
  ink-2: "#c4b9a3"
  ink-3: "#968b76"
  manila: "#ead9b0"
  manila-2: "#dcc58f"
  kraft: "#c39a63"
  kraft-ink: "#2b2115"
  kraft-ink-2: "#5a4630"
  tape: "#f3b329"
  tape-ink: "#2a1e05"
  seal: "#58b585"
  seal-deep: "#1f4a35"
  oxide: "#e2654f"
  oxide-deep: "#4d1c13"
typography:
  display:
    fontFamily: "Big Shoulders, Arial Narrow, sans-serif"
    fontSize: "clamp(3.4rem, 7.4vw, 6rem)"
    fontWeight: 800
    lineHeight: 0.9
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Big Shoulders, Arial Narrow, sans-serif"
    fontSize: "clamp(2.6rem, 4.8vw, 4.6rem)"
    fontWeight: 800
    lineHeight: 0.92
  title:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, sans-serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.02em"
rounded:
  tag: "3px"
  bench: "10px"
spacing:
  page: "40px"
  section: "144px"
components:
  button-primary:
    backgroundColor: "{colors.manila}"
    textColor: "{colors.kraft-ink}"
    rounded: "{rounded.tag}"
    padding: "12px 20px"
  button-primary-hover:
    backgroundColor: "#f3e4bf"
    textColor: "{colors.kraft-ink}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.tag}"
    padding: "12px 20px"
  button-tape:
    backgroundColor: "{colors.tape}"
    textColor: "{colors.tape-ink}"
    rounded: "{rounded.tag}"
    padding: "12px 20px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.oxide}"
    rounded: "{rounded.tag}"
    padding: "12px 20px"
  case-file:
    backgroundColor: "{colors.manila}"
    textColor: "{colors.kraft-ink}"
    rounded: "{rounded.bench}"
    padding: "24px 32px"
  approval-card:
    backgroundColor: "{colors.bench}"
    textColor: "{colors.ink}"
    rounded: "{rounded.bench}"
    padding: "20px"
---

## Overview

Praxis looks like the table where a finished case is laid out. The room is dark and warm. Paper is the only bright surface, and it is where the evidence sits: the goal, the exhibits, the trail, the verdict. A stamp is the verdict. Amber tape is the only thing that means a person has to act.

The north star is the Evidence Room. It was chosen over a mission-control dashboard and a chat transcript because the product's claim is that the work comes back proven. The interface should look like proof.

The sandbox apps (the vendor portal and NimbusERP) deliberately do not use this language. They look like the ordinary internal tools an employee would meet, so the agent's world and the product's world stay distinct.

## Colors

The room is a warm graphite, `#15120e`, lifted slightly on panels (`room-2`, `bench`). Ink on it runs from `#f1eadc` down to `#968b76`. Nothing in the room is blue.

Paper is manila `#ead9b0` with kraft ink `#2b2115`. Tags are kraft `#c39a63`.

Three colours carry meaning and nothing else does:

- Tape `#f3b329` means a person has to answer. Approvals, questions, a reviewer sending the agent back.
- Seal `#58b585` means checked and confirmed. On manila, the stamp uses a deeper green `#2d7a52` so it holds.
- Oxide `#e2654f` means failed, refused, or not done.

## Typography

Display is Big Shoulders, condensed, set tight, in capitals via CSS. It is for the headline and section titles only. Stencil (Big Shoulders Stencil) is for exhibit numbers and the case id, the things that get stamped or tagged.

Body is Schibsted Grotesk at 17px on the landing page and 14–15px inside the case view, where a person is scanning a long trail.

JetBrains Mono is for identifiers, amounts, tool names, and durations. If a value was read off a system, it is set in mono.

## Layout

The landing page is one column of sections at a 1320px measure, with the hero split between a 700px text column and the 3D table. The pinned story is two columns from 900px up: the beat on the left, the case file on the right. Below 900px the pin is dropped and every beat is just on the page.

Mission control is a three-column case at the wide breakpoint: the brief and the plan, the trail, then the verdict and the screenshots. The trail is the one column that scrolls on its own. The header stays put.

Spacing between landing sections is large, around 7–9rem. Inside a case file the rhythm tightens, because that surface is for reading a record, not for arriving.

## Elevation & Depth

Depth comes from the lamp, not from a stack of cards. Paper casts `--shadow-sheet`. Panels on the dark room are separated by a 1px seam, not by shadow. The 3D table is the one place with real light: one warm spot, contact shadows, and a little noise.

The seal is the only thing that scales and rotates into place. Everything else eases out. Reduced motion gets the settled frame and the full text, with no pin.

## Shapes

Tags are cut, not rounded. The exhibit tag is a clip-path flag with a punched hole, radius 3px everywhere else it needs a corner. Panels and the case file use 10px. Buttons use the tag radius, so they sit with the labels rather than looking like pills.

The approval card wears a striped tape band across its top edge. That band is the hazard marking, and it is the only stripe in the product.

## Components

**Exhibit tag.** Kraft by default. The exhibit id is stencil. Used for plan steps and for files the agent produced.

**Seal.** An SVG stamp with ring text. States are verified, failed, pending, and needs-you. On paper, pass `onPaper` so the ink darkens.

**Buttons.** Primary is manila paper. Quiet is a seam outline. Tape is the affirmative on an approval. Danger is an outline in oxide, used for decline and for destructive confirms.

**Case file.** Manila sheet, a tab at the top, kraft ink. This is the verdict, on the landing story and at the end of a run.

**Trail row.** One action is the rationale in body ink, the tool name in mono beneath it, and a screenshot to the right when there is one. Reviews get a left rule: green when they pass, amber when they send the work back. Facts are seal-green.

**Approval card.** Tape band, the consequence in a sentence, the tool and its arguments as a definition list, then approve or decline. A question with options renders those options as quiet buttons.

## Do's and Don'ts

Do keep colour for the three states. A new status uses ink, tape, seal, or oxide. It does not get its own hue.

Do set anything read off a system in mono: invoice numbers, amounts, tool names, case ids.

Do put the thing a person must answer above the trail. A waiting run is stalled until they do.

Don't make the sandbox look like the product. The portal and the ERP stay plain.

Don't round the tags into pills, and don't put a gradient behind the type.

Don't invent a customer, a metric, or a run. The landing story replays a real case id.
