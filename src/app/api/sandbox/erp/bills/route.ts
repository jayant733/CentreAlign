import { NextResponse } from "next/server";
import { bills, money } from "@/sandbox/db";
import { validateBill } from "@/sandbox/validation";

export const runtime = "nodejs";

/**
 * NimbusERP accounts-payable API.
 *
 * Reads are open. Writes require a service-account token that an AP clerk —
 * and therefore the agent — does not hold. That split is deliberate:
 *
 *  - it means the agent cannot shortcut the UI work, so the browser path is
 *    genuinely exercised rather than bypassed the moment an API exists;
 *  - the 403 is informative, so an agent that tries the API first learns why
 *    it failed and switches strategy on its own. That recovery is one of the
 *    behaviours worth demonstrating;
 *  - it gives the verifier a read path that is independent of the write path.
 */

const SERVICE_TOKEN = "nimbus-service-account-do-not-share";

function serialise(b: ReturnType<typeof bills.all>[number]) {
  return {
    id: b.id,
    reference: `BILL-${String(b.id).padStart(4, "0")}`,
    vendor_name: b.vendorName,
    invoice_number: b.invoiceNumber,
    amount_cents: b.amountCents,
    amount_display: money(b.amountCents, b.currency),
    currency: b.currency,
    due_date: b.dueDate,
    status: b.status,
    notes: b.notes,
    created_by: b.createdBy,
    created_at: new Date(b.createdAt).toISOString(),
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const invoiceNumber = url.searchParams.get("invoice_number");
  const vendor = url.searchParams.get("vendor_name");

  let rows = bills.all();
  if (invoiceNumber) {
    rows = rows.filter((b) => b.invoiceNumber.toLowerCase() === invoiceNumber.toLowerCase());
  }
  if (vendor) {
    rows = rows.filter((b) => b.vendorName.toLowerCase().includes(vendor.toLowerCase()));
  }

  return NextResponse.json({ count: rows.length, bills: rows.map(serialise) });
}

export async function POST(req: Request) {
  if (req.headers.get("x-nimbus-service-token") !== SERVICE_TOKEN) {
    return NextResponse.json(
      {
        error: "forbidden",
        message:
          "Write access to the accounts-payable API requires a NimbusERP service account. " +
          "Accounts-payable staff must enter bills through the web form at " +
          "/sandbox/erp/bills/new.",
      },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Body must be JSON." }, { status: 400 });
  }

  const result = validateBill(body as Record<string, unknown>);
  if (!result.ok) {
    return NextResponse.json({ error: "validation_failed", errors: result.errors }, { status: 422 });
  }

  const bill = bills.create({ ...result.value, createdBy: "service-account" });
  return NextResponse.json({ bill: serialise(bill) }, { status: 201 });
}
