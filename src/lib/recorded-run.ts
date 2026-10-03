/**
 * A real run, transcribed from the trace of run 1_XGuF3CW5 (Oct 3, 2026)
 * against the synthetic Northwind sandbox. The landing page replays this
 * instead of inventing a demo, so every line it shows actually happened.
 */

export const RECORDED_RUN = {
  id: "1_XGuF3CW5",
  goal:
    "Find the latest invoice from Acme, extract the total amount payable and the due date, enter it into NimbusERP, and tell me once it is done.",
  durationLabel: "3 min 42 s",
  actions: 34,
  artifacts: 26,
  steps: [
    {
      id: "A",
      title: "Log in to the vendor portal and find the latest Acme invoice",
      criterion: "The latest Acme invoice is open and its total and due date are extracted.",
    },
    {
      id: "B",
      title: "Record the invoice as a bill in NimbusERP",
      criterion: "The bill is submitted through NimbusERP.",
    },
    {
      id: "C",
      title: "Check the bill against the invoice",
      criterion: "The bill read back from the ERP matches the invoice exactly.",
    },
  ],
  trail: [
    { kind: "act", text: "Signed in to the vendor portal as the AP clerk" },
    { kind: "act", text: "Dismissed the cookie overlay that was blocking clicks" },
    { kind: "act", text: "Filtered to Acme Industrial Supply, sorted by invoice date" },
    { kind: "act", text: "Opened INV-ACM-2055" },
    {
      kind: "review",
      text: "Reviewer: retry. INV-ACM-2012 (22 Sep) is newer than INV-ACM-2055 (30 Aug). Wrong invoice.",
    },
    { kind: "act", text: "Opened INV-ACM-2012 instead" },
    { kind: "fail", text: "PDF download: 503, document service unavailable" },
    { kind: "act", text: "Retried the download. Got the PDF" },
    { kind: "fact", text: "Recorded total $18,415.49, the TOTAL DUE line, not the $17,012.00 subtotal" },
    { kind: "fact", text: "Recorded due date 2026-10-22, converted from \u201c22 October 2026\u201d" },
    { kind: "act", text: "Filled the NimbusERP bill form: amount 18415.49, no symbols or commas" },
    { kind: "act", text: "Saved. ERP confirmed BILL-0013" },
  ],
  verdict: {
    summary:
      "Done. The latest Acme invoice, INV-ACM-2012, for $18,415.49 due 2026-10-22, is recorded in NimbusERP as BILL-0013.",
    checks: [
      { label: "Latest Acme invoice identified", evidence: "INV-ACM-2012, invoice date 2026-09-22" },
      { label: "Total payable, not subtotal", evidence: "$18,415.49 from the PDF's TOTAL DUE line" },
      { label: "Bill exists in the ledger", evidence: "GET /api/sandbox/erp/bills → BILL-0013, 1841549 cents" },
    ],
  },
} as const;
