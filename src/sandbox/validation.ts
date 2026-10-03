import { bills, vendors } from "./db";

/**
 * Validation for new accounts-payable bills.
 *
 * Deliberately shared between the HTML form handler and the JSON API so both
 * paths enforce identical rules. That matters for the agent: if it discovers
 * the API is easier than the form, it must not get a laxer contract, and the
 * verifier can trust the two paths agree.
 *
 * The rules are picky on purpose. A clerk reading an invoice PDF sees
 * "$18,415.49 USD" and "22 October 2026"; this system accepts neither form, so
 * the agent has to actually normalise what it extracted.
 */

export interface RawBillInput {
  vendorName?: unknown;
  invoiceNumber?: unknown;
  amount?: unknown;
  dueDate?: unknown;
  notes?: unknown;
}

export interface ValidBill {
  vendorName: string;
  invoiceNumber: string;
  amountCents: number;
  dueDate: string;
  notes: string | null;
}

export type ValidationResult =
  | { ok: true; value: ValidBill }
  | { ok: false; errors: Array<{ field: string; message: string }> };

const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateBill(raw: RawBillInput): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];

  const vendorName = String(raw.vendorName ?? "").trim();
  const invoiceNumber = String(raw.invoiceNumber ?? "").trim();
  const amountRaw = String(raw.amount ?? "").trim();
  const dueDate = String(raw.dueDate ?? "").trim();
  const notes = String(raw.notes ?? "").trim();

  const known = vendors.all().map((v) => v.name);
  if (!vendorName) {
    errors.push({ field: "vendorName", message: "Supplier is required." });
  } else if (!known.includes(vendorName)) {
    errors.push({
      field: "vendorName",
      message: `Unknown supplier "${vendorName}". Must exactly match a registered supplier: ${known.join(", ")}.`,
    });
  }

  if (!invoiceNumber) {
    errors.push({ field: "invoiceNumber", message: "Invoice number is required." });
  } else if (bills.byInvoiceNumber(invoiceNumber)) {
    errors.push({
      field: "invoiceNumber",
      message: `A bill for invoice ${invoiceNumber} already exists in the ledger. Duplicate entries are not permitted.`,
    });
  }

  if (!amountRaw) {
    errors.push({ field: "amount", message: "Amount is required." });
  } else if (!AMOUNT_RE.test(amountRaw)) {
    errors.push({
      field: "amount",
      message:
        "Amount must be a plain number with at most two decimal places and no currency symbol, " +
        "thousands separator or trailing text. Example: 18415.49",
    });
  }

  if (!dueDate) {
    errors.push({ field: "dueDate", message: "Due date is required." });
  } else if (!DATE_RE.test(dueDate)) {
    errors.push({
      field: "dueDate",
      message: "Due date must be an ISO calendar date in YYYY-MM-DD format. Example: 2026-10-22",
    });
  } else if (Number.isNaN(Date.parse(dueDate))) {
    errors.push({ field: "dueDate", message: `"${dueDate}" is not a valid calendar date.` });
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      vendorName,
      invoiceNumber,
      amountCents: Math.round(Number(amountRaw) * 100),
      dueDate,
      notes: notes || null,
    },
  };
}
