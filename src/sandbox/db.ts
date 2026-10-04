import { statement } from "@/db/client";

/**
 * The simulated company's own database, in the `sandbox` schema. Kept separate
 * from the agent's state on purpose: the agent must reach this data the way an
 * employee would, through the portal UI or the ERP API, never by reading its
 * own tables.
 */

export const sdb = {
  prepare(sql: string) {
    return statement(sql);
  },
};

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

export interface Vendor {
  id: number;
  name: string;
  slug: string;
  email: string;
  paymentTerms: string;
  category: string;
}

export interface Invoice {
  id: number;
  number: string;
  vendorId: number;
  vendorName: string;
  poNumber: string | null;
  issueDate: string;
  dueDate: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  status: string;
  pdfFile: string | null;
}

export interface Bill {
  id: number;
  vendorName: string;
  invoiceNumber: string;
  amountCents: number;
  currency: string;
  dueDate: string;
  status: string;
  notes: string | null;
  createdBy: string;
  createdAt: number;
}

type Row = Record<string, unknown>;

export function money(cents: number, currency = "USD"): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  const withCommas = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${currency === "USD" ? "$" : currency + " "}${withCommas}`;
}

/** Accepts "1234.56", "$1,234.56", "1 234,56" and returns integer cents. */
export function parseMoneyToCents(input: string | number): number | null {
  if (typeof input === "number") return Math.round(input * 100);
  const cleaned = input.replace(/[^0-9.,-]/g, "");
  if (!cleaned) return null;
  // Whichever separator appears last is the decimal separator.
  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  let normalised = cleaned;
  if (lastComma > lastDot) {
    normalised = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    normalised = cleaned.replace(/,/g, "");
  }
  const n = Number(normalised);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/* -------------------------------------------------------------------------- */
/* Vendors and invoices (vendor portal side)                                  */
/* -------------------------------------------------------------------------- */

const INVOICE_SELECT = `
  SELECT i.*, v.name AS vendor_name
  FROM sandbox.invoices i JOIN sandbox.vendors v ON v.id = i.vendor_id
`;

function toInvoice(r: Row): Invoice {
  return {
    id: Number(r.id),
    number: String(r.number),
    vendorId: Number(r.vendor_id),
    vendorName: String(r.vendor_name),
    poNumber: (r.po_number as string | null) ?? null,
    issueDate: String(r.issue_date),
    dueDate: String(r.due_date),
    subtotalCents: Number(r.subtotal_cents),
    taxCents: Number(r.tax_cents),
    totalCents: Number(r.total_cents),
    currency: String(r.currency),
    status: String(r.status),
    pdfFile: (r.pdf_file as string | null) ?? null,
  };
}

function toVendor(r: Row): Vendor {
  return {
    id: Number(r.id),
    name: String(r.name),
    slug: String(r.slug),
    email: String(r.email),
    paymentTerms: String(r.payment_terms),
    category: String(r.category),
  };
}

export const vendors = {
  all(): Vendor[] {
    return (sdb.prepare(`SELECT * FROM sandbox.vendors ORDER BY name`).all() as Row[]).map(toVendor);
  },
  byName(name: string): Vendor | null {
    const r = sdb
      .prepare(`SELECT * FROM sandbox.vendors WHERE lower(name) = lower(?::text) OR lower(slug) = lower(?::text)`)
      .get(name, name) as Row | undefined;
    return r ? toVendor(r) : null;
  },
  /** Loose match, because a user says "Acme" and the record says
   *  "Acme Industrial Supply". */
  search(q: string): Vendor[] {
    return (
      sdb.prepare(`SELECT * FROM sandbox.vendors WHERE lower(name) LIKE '%' || lower(?::text) || '%' ORDER BY name`)
        .all(q) as Row[]
    ).map(toVendor);
  },
};

export const invoices = {
  all(): Invoice[] {
    return (sdb.prepare(`${INVOICE_SELECT} ORDER BY i.issue_date DESC`).all() as Row[]).map(
      toInvoice,
    );
  },
  byNumber(number: string): Invoice | null {
    const r = sdb
      .prepare(`${INVOICE_SELECT} WHERE lower(i.number) = lower(?::text)`)
      .get(number) as Row | undefined;
    return r ? toInvoice(r) : null;
  },
  forVendor(vendorId: number): Invoice[] {
    return (
      sdb.prepare(`${INVOICE_SELECT} WHERE i.vendor_id = ? ORDER BY i.issue_date DESC`)
        .all(vendorId) as Row[]
    ).map(toInvoice);
  },
};

/* -------------------------------------------------------------------------- */
/* Bills and payments (NimbusERP side)                                        */
/* -------------------------------------------------------------------------- */

function toBill(r: Row): Bill {
  return {
    id: Number(r.id),
    vendorName: String(r.vendor_name),
    invoiceNumber: String(r.invoice_number),
    amountCents: Number(r.amount_cents),
    currency: String(r.currency),
    dueDate: String(r.due_date),
    status: String(r.status),
    notes: (r.notes as string | null) ?? null,
    createdBy: String(r.created_by),
    createdAt: Number(r.created_at),
  };
}

export const bills = {
  all(): Bill[] {
    return (sdb.prepare(`SELECT * FROM sandbox.bills ORDER BY created_at DESC`).all() as Row[]).map(toBill);
  },
  get(id: number): Bill | null {
    const r = sdb.prepare(`SELECT * FROM sandbox.bills WHERE id = ?`).get(id) as Row | undefined;
    return r ? toBill(r) : null;
  },
  byInvoiceNumber(invoiceNumber: string): Bill | null {
    const r = sdb
      .prepare(`SELECT * FROM sandbox.bills WHERE lower(invoice_number) = lower(?::text)`)
      .get(invoiceNumber) as Row | undefined;
    return r ? toBill(r) : null;
  },
  create(input: {
    vendorName: string;
    invoiceNumber: string;
    amountCents: number;
    dueDate: string;
    currency?: string;
    notes?: string | null;
    createdBy: string;
  }): Bill {
    const ts = Date.now();
    const res = sdb
      .prepare(
        `INSERT INTO sandbox.bills (vendor_name, invoice_number, amount_cents, currency, due_date,
                            status, notes, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending_approval', ?, ?, ?)
         RETURNING id`,
      )
      .run(
        input.vendorName,
        input.invoiceNumber,
        input.amountCents,
        input.currency ?? "USD",
        input.dueDate,
        input.notes ?? null,
        input.createdBy,
        ts,
      );
    audit.log("bill", "created", input.createdBy, `${input.invoiceNumber} ${input.amountCents}`);
    return bills.get(Number(res.lastInsertRowid))!;
  },
  markPaid(id: number): void {
    sdb.prepare(`UPDATE sandbox.bills SET status = 'paid' WHERE id = ?`).run(id);
  },
};

export const payments = {
  create(billId: number, amountCents: number, approvedBy: string): { id: number; reference: string } {
    const reference = `PAY-${Date.now().toString(36).toUpperCase()}`;
    const res = sdb
      .prepare(
        `INSERT INTO sandbox.payments (bill_id, amount_cents, reference, approved_by, created_at)
         VALUES (?, ?, ?, ?, ?)
         RETURNING id`,
      )
      .run(billId, amountCents, reference, approvedBy, Date.now());
    bills.markPaid(billId);
    audit.log("payment", "created", approvedBy, `${reference} bill=${billId}`);
    return { id: Number(res.lastInsertRowid), reference };
  },
  forBill(billId: number) {
    return sdb.prepare(`SELECT * FROM sandbox.payments WHERE bill_id = ?`).all(billId) as Row[];
  },
};

export const audit = {
  log(entity: string, action: string, actor: string, detail?: string): void {
    sdb
      .prepare(`INSERT INTO sandbox.audit_log (entity, action, actor, detail, ts) VALUES (?, ?, ?, ?, ?)`)
      .run(entity, action, actor, detail ?? null, Date.now());
  },
  recent(limit = 50): Row[] {
    return sdb.prepare(`SELECT * FROM sandbox.audit_log ORDER BY ts DESC LIMIT ?`).all(limit) as Row[];
  },
};

/* -------------------------------------------------------------------------- */
/* Portal auth                                                                */
/* -------------------------------------------------------------------------- */

export const portalAuth = {
  verify(email: string, password: string): { email: string; name: string } | null {
    const r = sdb
      .prepare(`SELECT * FROM sandbox.portal_users WHERE lower(email) = lower(?::text) AND password = ?`)
      .get(email, password) as Row | undefined;
    return r ? { email: String(r.email), name: String(r.name) } : null;
  },
  createSession(email: string): string {
    const token = `sess_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    sdb
      .prepare(`INSERT INTO sandbox.portal_sessions (token, email, created_at) VALUES (?, ?, ?)`)
      .run(token, email, Date.now());
    return token;
  },
  session(token: string | undefined): { email: string; name: string } | null {
    if (!token) return null;
    const r = sdb
      .prepare(
        `SELECT u.email, u.name FROM sandbox.portal_sessions s
         JOIN sandbox.portal_users u ON lower(u.email) = lower(s.email) WHERE s.token = ?`,
      )
      .get(token) as Row | undefined;
    return r ? { email: String(r.email), name: String(r.name) } : null;
  },
};

/* -------------------------------------------------------------------------- */
/* Fault injection                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Returns true the first `failures` times it is called for a key. Used to make
 * the vendor portal unreliable in a *reproducible* way, so the agent's retry
 * path is exercised on every run and in the eval suite, not just by luck.
 */
export function shouldInjectFault(key: string, failures = 1): boolean {
  const row = sdb.prepare(`SELECT hits FROM sandbox.fault_state WHERE key = ?`).get(key) as Row | undefined;
  const hits = Number(row?.hits ?? 0);
  sdb
    .prepare(
      `INSERT INTO sandbox.fault_state (key, hits) VALUES (?, 1)
       ON CONFLICT(key) DO UPDATE SET hits = sandbox.fault_state.hits + 1`,
    )
    .run(key);
  return hits < failures;
}

export function resetFaults(): void {
  sdb.prepare(`DELETE FROM sandbox.fault_state`).run();
}
