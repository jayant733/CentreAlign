import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { config } from "@/agent/config";

/**
 * The simulated company's own database. Kept separate from the agent's state
 * database on purpose: the agent must reach this data the way an employee
 * would, through the portal UI or the ERP API, never by reading its own tables.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS vendors (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL UNIQUE,
  slug           TEXT NOT NULL UNIQUE,
  email          TEXT NOT NULL,
  payment_terms  TEXT NOT NULL,
  category       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  number       TEXT NOT NULL UNIQUE,
  vendor_id    INTEGER NOT NULL REFERENCES vendors(id),
  po_number    TEXT,
  issue_date   TEXT NOT NULL,
  due_date     TEXT NOT NULL,
  subtotal_cents INTEGER NOT NULL,
  tax_cents    INTEGER NOT NULL,
  total_cents  INTEGER NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'USD',
  status       TEXT NOT NULL,
  pdf_file     TEXT
);

-- NimbusERP accounts-payable ledger. This is what the agent has to write into.
CREATE TABLE IF NOT EXISTS bills (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_name     TEXT NOT NULL,
  invoice_number  TEXT NOT NULL UNIQUE,
  amount_cents    INTEGER NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'USD',
  due_date        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending_approval',
  notes           TEXT,
  created_by      TEXT NOT NULL,
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id       INTEGER NOT NULL REFERENCES bills(id),
  amount_cents  INTEGER NOT NULL,
  reference     TEXT NOT NULL,
  approved_by   TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  entity  TEXT NOT NULL,
  action  TEXT NOT NULL,
  actor   TEXT NOT NULL,
  detail  TEXT,
  ts      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS portal_users (
  email    TEXT PRIMARY KEY,
  password TEXT NOT NULL,
  name     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS portal_sessions (
  token      TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Tracks deliberately injected faults so they are reproducible: the first
-- request for a given key fails, later ones succeed.
CREATE TABLE IF NOT EXISTS fault_state (
  key   TEXT PRIMARY KEY,
  hits  INTEGER NOT NULL DEFAULT 0
);
`;

function open(): DatabaseSync {
  fs.mkdirSync(path.dirname(config.sandboxDbPath), { recursive: true });
  const db = new DatabaseSync(config.sandboxDbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

const globalRef = globalThis as unknown as { __sandboxDb?: DatabaseSync };
export const sdb: DatabaseSync =
  globalRef.__sandboxDb ?? (globalRef.__sandboxDb = open());

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
  FROM invoices i JOIN vendors v ON v.id = i.vendor_id
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
    return (sdb.prepare(`SELECT * FROM vendors ORDER BY name`).all() as Row[]).map(toVendor);
  },
  byName(name: string): Vendor | null {
    const r = sdb
      .prepare(`SELECT * FROM vendors WHERE lower(name) = lower(?) OR lower(slug) = lower(?)`)
      .get(name, name) as Row | undefined;
    return r ? toVendor(r) : null;
  },
  /** Loose match, because a user says "Acme" and the record says
   *  "Acme Industrial Supply". */
  search(q: string): Vendor[] {
    return (
      sdb.prepare(`SELECT * FROM vendors WHERE lower(name) LIKE '%' || lower(?) || '%' ORDER BY name`)
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
      .prepare(`${INVOICE_SELECT} WHERE lower(i.number) = lower(?)`)
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
    return (sdb.prepare(`SELECT * FROM bills ORDER BY created_at DESC`).all() as Row[]).map(toBill);
  },
  get(id: number): Bill | null {
    const r = sdb.prepare(`SELECT * FROM bills WHERE id = ?`).get(id) as Row | undefined;
    return r ? toBill(r) : null;
  },
  byInvoiceNumber(invoiceNumber: string): Bill | null {
    const r = sdb
      .prepare(`SELECT * FROM bills WHERE lower(invoice_number) = lower(?)`)
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
        `INSERT INTO bills (vendor_name, invoice_number, amount_cents, currency, due_date,
                            status, notes, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending_approval', ?, ?, ?)`,
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
    sdb.prepare(`UPDATE bills SET status = 'paid' WHERE id = ?`).run(id);
  },
};

export const payments = {
  create(billId: number, amountCents: number, approvedBy: string): { id: number; reference: string } {
    const reference = `PAY-${Date.now().toString(36).toUpperCase()}`;
    const res = sdb
      .prepare(
        `INSERT INTO payments (bill_id, amount_cents, reference, approved_by, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(billId, amountCents, reference, approvedBy, Date.now());
    bills.markPaid(billId);
    audit.log("payment", "created", approvedBy, `${reference} bill=${billId}`);
    return { id: Number(res.lastInsertRowid), reference };
  },
  forBill(billId: number) {
    return sdb.prepare(`SELECT * FROM payments WHERE bill_id = ?`).all(billId) as Row[];
  },
};

export const audit = {
  log(entity: string, action: string, actor: string, detail?: string): void {
    sdb
      .prepare(`INSERT INTO audit_log (entity, action, actor, detail, ts) VALUES (?, ?, ?, ?, ?)`)
      .run(entity, action, actor, detail ?? null, Date.now());
  },
  recent(limit = 50): Row[] {
    return sdb.prepare(`SELECT * FROM audit_log ORDER BY ts DESC LIMIT ?`).all(limit) as Row[];
  },
};

/* -------------------------------------------------------------------------- */
/* Portal auth                                                                */
/* -------------------------------------------------------------------------- */

export const portalAuth = {
  verify(email: string, password: string): { email: string; name: string } | null {
    const r = sdb
      .prepare(`SELECT * FROM portal_users WHERE lower(email) = lower(?) AND password = ?`)
      .get(email, password) as Row | undefined;
    return r ? { email: String(r.email), name: String(r.name) } : null;
  },
  createSession(email: string): string {
    const token = `sess_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    sdb
      .prepare(`INSERT INTO portal_sessions (token, email, created_at) VALUES (?, ?, ?)`)
      .run(token, email, Date.now());
    return token;
  },
  session(token: string | undefined): { email: string; name: string } | null {
    if (!token) return null;
    const r = sdb
      .prepare(
        `SELECT u.email, u.name FROM portal_sessions s
         JOIN portal_users u ON lower(u.email) = lower(s.email) WHERE s.token = ?`,
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
  const row = sdb.prepare(`SELECT hits FROM fault_state WHERE key = ?`).get(key) as Row | undefined;
  const hits = Number(row?.hits ?? 0);
  sdb
    .prepare(
      `INSERT INTO fault_state (key, hits) VALUES (?, 1)
       ON CONFLICT(key) DO UPDATE SET hits = hits + 1`,
    )
    .run(key);
  return hits < failures;
}

export function resetFaults(): void {
  sdb.prepare(`DELETE FROM fault_state`).run();
}
