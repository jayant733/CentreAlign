import { NextResponse } from "next/server";
import { bills } from "@/sandbox/db";
import { validateBill } from "@/sandbox/validation";

export const runtime = "nodejs";

/**
 * Handles the HTML form submission. On failure it redirects back to the form
 * with the errors and the submitted values, which is what a real app does and
 * what the agent must be able to read and recover from.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const raw = {
    vendorName: form.get("vendorName"),
    invoiceNumber: form.get("invoiceNumber"),
    amount: form.get("amount"),
    dueDate: form.get("dueDate"),
    notes: form.get("notes"),
  };
  const origin = new URL(req.url).origin;

  const result = validateBill(raw);
  if (!result.ok) {
    const p = new URLSearchParams();
    for (const e of result.errors) p.append("err", e.message);
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string" && v) p.set(k, v);
    }
    return NextResponse.redirect(`${origin}/sandbox/erp/bills/new?${p.toString()}`, 303);
  }

  const bill = bills.create({ ...result.value, createdBy: "praxis-agent" });
  return NextResponse.redirect(`${origin}/sandbox/erp/bills/${bill.id}?created=1`, 303);
}
