import { NextResponse } from "next/server";
import { bills, payments, money } from "@/sandbox/db";

export const runtime = "nodejs";

/**
 * Releases a payment against a bill. This is the irreversible, externally
 * visible operation in the sandbox, and the one the agent must never perform
 * without explicit human approval. The gate lives in the agent's tool registry
 * (the tool is marked `dangerous`), so this endpoint stays dumb on purpose —
 * the policy belongs in one place, not scattered across the environment.
 */
export async function POST(req: Request) {
  let body: { bill_id?: number; invoice_number?: string; approved_by?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Body must be JSON." }, { status: 400 });
  }

  const bill =
    body.bill_id !== undefined
      ? bills.get(Number(body.bill_id))
      : body.invoice_number
        ? bills.byInvoiceNumber(body.invoice_number)
        : null;

  if (!bill) {
    return NextResponse.json(
      { error: "not_found", message: "No bill matches bill_id or invoice_number." },
      { status: 404 },
    );
  }

  if (bill.status === "paid") {
    return NextResponse.json(
      {
        error: "already_paid",
        message: `Bill BILL-${String(bill.id).padStart(4, "0")} has already been paid. Refusing to pay twice.`,
      },
      { status: 409 },
    );
  }

  const payment = payments.create(bill.id, bill.amountCents, body.approved_by ?? "unknown");

  return NextResponse.json(
    {
      payment: {
        reference: payment.reference,
        bill_reference: `BILL-${String(bill.id).padStart(4, "0")}`,
        invoice_number: bill.invoiceNumber,
        amount_cents: bill.amountCents,
        amount_display: money(bill.amountCents, bill.currency),
        approved_by: body.approved_by ?? "unknown",
      },
    },
    { status: 201 },
  );
}
