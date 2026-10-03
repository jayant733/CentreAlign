import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { config } from "@/agent/config";
import { sdb, resetFaults } from "./db";

/**
 * Builds the simulated company environment from scratch: vendors, invoices,
 * real PDF files on disk, and a partially-populated ERP ledger.
 *
 * The data is shaped to defeat shortcuts rather than to be convenient:
 *  - invoice numbers do not sort the same way as invoice dates, so "latest
 *    invoice" cannot be answered by sorting on the number;
 *  - every PDF shows a subtotal, a tax line and a total, so an agent that
 *    grabs the first currency-looking string gets the wrong answer;
 *  - each vendor writes dates in a different format, so date handling has to
 *    be real parsing rather than one regex.
 */

export const INVOICE_DIR = path.join(config.dataDir, "sandbox", "invoices");

type DateStyle = "long" | "us" | "iso" | "dmy";

interface VendorSeed {
  name: string;
  slug: string;
  email: string;
  paymentTerms: string;
  category: string;
  dateStyle: DateStyle;
  address: string;
}

interface InvoiceSeed {
  number: string;
  vendor: string;
  po: string | null;
  issue: string;
  due: string;
  subtotalCents: number;
  taxRate: number;
  status: "open" | "paid" | "overdue";
  lines: Array<{ description: string; qty: number; unitCents: number }>;
}

const VENDORS: VendorSeed[] = [
  {
    name: "Acme Industrial Supply",
    slug: "acme",
    email: "billing@acme-industrial.example",
    paymentTerms: "Net 30",
    category: "Industrial parts",
    dateStyle: "long",
    address: "1400 Foundry Road, Akron, OH 44301",
  },
  {
    name: "Globex Logistics",
    slug: "globex",
    email: "ar@globex-logistics.example",
    paymentTerms: "Net 15",
    category: "Freight & haulage",
    dateStyle: "us",
    address: "88 Harbour Way, Long Beach, CA 90802",
  },
  {
    name: "Initech Software",
    slug: "initech",
    email: "invoices@initech.example",
    paymentTerms: "Net 45",
    category: "Software licences",
    dateStyle: "iso",
    address: "Tower 2, 500 Market Street, Austin, TX 78701",
  },
  {
    name: "Umbrella Freight Co",
    slug: "umbrella",
    email: "billing@umbrella-freight.example",
    paymentTerms: "Net 30",
    category: "Freight & haulage",
    dateStyle: "dmy",
    address: "7 Dock Lane, Newark, NJ 07102",
  },
];

const INVOICES: InvoiceSeed[] = [
  // Acme. Note INV-ACM-2055 has the highest number but an earlier date than
  // INV-ACM-2012, which is the genuinely latest Acme invoice.
  {
    number: "INV-ACM-1950",
    vendor: "acme",
    po: "PO-88410",
    issue: "2026-06-18",
    due: "2026-07-18",
    subtotalCents: 198_000,
    taxRate: 0.0825,
    status: "paid",
    lines: [{ description: "Hydraulic seal kit, 50mm", qty: 12, unitCents: 16_500 }],
  },
  {
    number: "INV-ACM-1988",
    vendor: "acme",
    po: "PO-88677",
    issue: "2026-07-05",
    due: "2026-08-04",
    subtotalCents: 675_000,
    taxRate: 0.0825,
    status: "paid",
    lines: [
      { description: "Conveyor belt section, 3m", qty: 9, unitCents: 55_000 },
      { description: "Installation labour", qty: 6, unitCents: 30_000 },
    ],
  },
  {
    number: "INV-ACM-2012",
    vendor: "acme",
    po: "PO-89204",
    issue: "2026-09-22",
    due: "2026-10-22",
    subtotalCents: 1_701_200,
    taxRate: 0.0825,
    status: "open",
    lines: [
      { description: "CNC spindle assembly, model SX-9", qty: 2, unitCents: 612_000 },
      { description: "Precision bearing set", qty: 16, unitCents: 24_200 },
      { description: "Freight and handling", qty: 1, unitCents: 90_000 },
    ],
  },
  {
    number: "INV-ACM-2055",
    vendor: "acme",
    po: "PO-88991",
    issue: "2026-08-30",
    due: "2026-09-29",
    subtotalCents: 1_198_800,
    taxRate: 0.0825,
    status: "overdue",
    lines: [
      { description: "Pneumatic actuator, 200mm bore", qty: 8, unitCents: 134_850 },
      { description: "Mounting hardware", qty: 1, unitCents: 120_000 },
    ],
  },

  // Globex
  {
    number: "INV-GBX-7741",
    vendor: "globex",
    po: "PO-71120",
    issue: "2026-08-11",
    due: "2026-08-26",
    subtotalCents: 432_500,
    taxRate: 0.06,
    status: "overdue",
    lines: [{ description: "Container drayage, 14 moves", qty: 14, unitCents: 30_892 }],
  },
  {
    number: "INV-GBX-7802",
    vendor: "globex",
    po: null,
    issue: "2026-09-09",
    due: "2026-09-24",
    subtotalCents: 289_900,
    taxRate: 0.06,
    status: "overdue",
    lines: [{ description: "LTL freight, Zone 4", qty: 1, unitCents: 289_900 }],
  },
  {
    number: "INV-GBX-7845",
    vendor: "globex",
    po: "PO-71388",
    issue: "2026-09-28",
    due: "2026-10-13",
    subtotalCents: 515_000,
    taxRate: 0.06,
    status: "open",
    lines: [
      { description: "Refrigerated transport, 5 loads", qty: 5, unitCents: 83_000 },
      { description: "Fuel surcharge", qty: 1, unitCents: 100_000 },
    ],
  },

  // Initech
  {
    number: "INI-2026-0188",
    vendor: "initech",
    po: "PO-50021",
    issue: "2026-07-30",
    due: "2026-09-13",
    subtotalCents: 1_250_000,
    taxRate: 0,
    status: "paid",
    lines: [{ description: "Platform licence, 250 seats, annual", qty: 250, unitCents: 5_000 }],
  },
  {
    number: "INI-2026-0211",
    vendor: "initech",
    po: "PO-50088",
    issue: "2026-09-15",
    due: "2026-10-30",
    subtotalCents: 980_000,
    taxRate: 0,
    status: "open",
    lines: [{ description: "Premium support tier, Q4", qty: 1, unitCents: 980_000 }],
  },
  {
    number: "INI-2026-0225",
    vendor: "initech",
    po: "PO-50140",
    issue: "2026-10-01",
    due: "2026-11-15",
    subtotalCents: 1_440_000,
    taxRate: 0,
    status: "open",
    lines: [
      { description: "Data warehouse add-on", qty: 1, unitCents: 1_200_000 },
      { description: "Onboarding services", qty: 8, unitCents: 30_000 },
    ],
  },

  // Umbrella
  {
    number: "UFC-55120",
    vendor: "umbrella",
    po: null,
    issue: "2026-08-22",
    due: "2026-09-21",
    subtotalCents: 76_400,
    taxRate: 0.07,
    status: "overdue",
    lines: [{ description: "Pallet storage, 4 weeks", qty: 4, unitCents: 19_100 }],
  },
  {
    number: "UFC-55208",
    vendor: "umbrella",
    po: "PO-61004",
    issue: "2026-09-19",
    due: "2026-10-19",
    subtotalCents: 318_750,
    taxRate: 0.07,
    status: "open",
    lines: [{ description: "Regional delivery runs", qty: 25, unitCents: 12_750 }],
  },
  {
    number: "UFC-55301",
    vendor: "umbrella",
    po: "PO-61077",
    issue: "2026-09-30",
    due: "2026-10-30",
    subtotalCents: 204_000,
    taxRate: 0.07,
    status: "open",
    lines: [{ description: "Expedited courier, overnight", qty: 12, unitCents: 17_000 }],
  },
];

/** Pre-existing ERP rows. The Globex one is deliberately wrong (it records the
 *  subtotal instead of the total) so the reconciliation task has something
 *  real to find. */
const EXISTING_BILLS = [
  {
    invoiceNumber: "INI-2026-0188",
    vendorName: "Initech Software",
    amountCents: 1_250_000,
    dueDate: "2026-09-13",
    status: "paid",
    notes: "Annual licence renewal. Approved by M. Reyes.",
  },
  {
    invoiceNumber: "INV-GBX-7741",
    vendorName: "Globex Logistics",
    amountCents: 432_500,
    dueDate: "2026-08-26",
    status: "pending_approval",
    notes: "Entered from emailed PDF.",
  },
  {
    invoiceNumber: "INV-ACM-1988",
    vendorName: "Acme Industrial Supply",
    amountCents: 730_688,
    dueDate: "2026-08-04",
    status: "paid",
    notes: "Matched to PO-88677.",
  },
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Renders an ISO date the way a given vendor would print it. */
export function formatDate(iso: string, style: DateStyle): string {
  const [y, m, d] = iso.split("-").map(Number);
  switch (style) {
    case "long":
      return `${d} ${MONTHS[m - 1]} ${y}`;
    case "us":
      return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y}`;
    case "iso":
      return iso;
    case "dmy":
      return `${String(d).padStart(2, "0")}-${MONTHS[m - 1].slice(0, 3)}-${y}`;
  }
}

function fmt(cents: number): string {
  const s = (cents / 100).toFixed(2);
  return `$${s.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

async function renderInvoicePdf(inv: InvoiceSeed, vendor: VendorSeed): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const body = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.11, 0.13);
  const muted = rgb(0.42, 0.45, 0.5);

  let y = 790;
  const left = 48;
  const right = 547;

  const text = (
    s: string,
    opts: { x?: number; size?: number; font?: typeof body; color?: typeof ink; rightAlign?: boolean } = {},
  ) => {
    const size = opts.size ?? 10;
    const font = opts.font ?? body;
    const x = opts.rightAlign ? right - font.widthOfTextAtSize(s, size) : (opts.x ?? left);
    page.drawText(s, { x, y, size, font, color: opts.color ?? ink });
  };

  text(vendor.name, { size: 20, font: bold });
  y -= 16;
  text(vendor.address, { size: 9, color: muted });
  y -= 12;
  text(vendor.email, { size: 9, color: muted });

  y += 28;
  text("INVOICE", { size: 20, font: bold, rightAlign: true });
  y -= 18;
  text(inv.number, { size: 11, font: bold, rightAlign: true });
  y -= 40;

  page.drawLine({
    start: { x: left, y: y + 10 },
    end: { x: right, y: y + 10 },
    thickness: 0.8,
    color: rgb(0.85, 0.86, 0.88),
  });
  y -= 10;

  text("Bill To", { size: 8, font: bold, color: muted });
  text("Invoice Date", { size: 8, font: bold, color: muted, x: 330 });
  y -= 13;
  text("Northwind Manufacturing Ltd", { size: 10 });
  text(formatDate(inv.issue, vendor.dateStyle), { size: 10, x: 330 });
  y -= 13;
  text("Accounts Payable", { size: 9, color: muted });
  text("Payment Due", { size: 8, font: bold, color: muted, x: 330 });
  y -= 13;
  text("2200 Willow Creek Parkway", { size: 9, color: muted });
  text(formatDate(inv.due, vendor.dateStyle), { size: 10, font: bold, x: 330 });
  y -= 13;
  text("Columbus, OH 43215", { size: 9, color: muted });
  text(`Terms: ${vendor.paymentTerms}`, { size: 9, color: muted, x: 330 });
  y -= 13;
  if (inv.po) text(`Purchase Order: ${inv.po}`, { size: 9, color: muted, x: 330 });

  y -= 36;
  text("Description", { size: 8, font: bold, color: muted });
  page.drawText("Qty", { x: 360, y, size: 8, font: bold, color: muted });
  page.drawText("Unit", { x: 410, y, size: 8, font: bold, color: muted });
  page.drawText("Amount", { x: 490, y, size: 8, font: bold, color: muted });
  y -= 6;
  page.drawLine({
    start: { x: left, y },
    end: { x: right, y },
    thickness: 0.8,
    color: rgb(0.85, 0.86, 0.88),
  });
  y -= 16;

  for (const line of inv.lines) {
    const amount = line.qty * line.unitCents;
    text(line.description, { size: 10 });
    page.drawText(String(line.qty), { x: 360, y, size: 10, font: body, color: ink });
    page.drawText(fmt(line.unitCents), { x: 410, y, size: 10, font: body, color: ink });
    const a = fmt(amount);
    page.drawText(a, { x: right - body.widthOfTextAtSize(a, 10), y, size: 10, font: body, color: ink });
    y -= 18;
  }

  const tax = Math.round(inv.subtotalCents * inv.taxRate);
  const total = inv.subtotalCents + tax;

  y -= 10;
  page.drawLine({
    start: { x: 330, y: y + 8 },
    end: { x: right, y: y + 8 },
    thickness: 0.8,
    color: rgb(0.85, 0.86, 0.88),
  });
  y -= 8;

  const row = (label: string, value: string, strong = false) => {
    const font = strong ? bold : body;
    const size = strong ? 12 : 10;
    page.drawText(label, { x: 330, y, size, font, color: strong ? ink : muted });
    page.drawText(value, {
      x: right - font.widthOfTextAtSize(value, size),
      y,
      size,
      font,
      color: ink,
    });
    y -= strong ? 22 : 16;
  };

  row("Subtotal", fmt(inv.subtotalCents));
  row(inv.taxRate ? `Sales tax (${(inv.taxRate * 100).toFixed(2)}%)` : "Sales tax", fmt(tax));
  row("TOTAL DUE", `${fmt(total)} USD`, true);

  y -= 20;
  text(
    `Remit payment by ${formatDate(inv.due, vendor.dateStyle)}. Reference ${inv.number} on all payments.`,
    { size: 9, color: muted },
  );
  y -= 28;
  text("This is a sandbox document generated for the Praxis prototype. Not a real invoice.", {
    size: 7,
    color: rgb(0.6, 0.62, 0.66),
  });

  return doc.save();
}

export async function seedSandbox(): Promise<{ vendors: number; invoices: number; bills: number }> {
  fs.mkdirSync(INVOICE_DIR, { recursive: true });
  fs.mkdirSync(config.workspaceDir, { recursive: true });
  fs.mkdirSync(config.artifactsDir, { recursive: true });

  // Full reset so every demo and eval run starts from identical state.
  for (const table of [
    "payments", "bills", "audit_log", "invoices", "vendors",
    "portal_sessions", "portal_users", "fault_state",
  ]) {
    sdb.prepare(`DELETE FROM ${table}`).run();
  }
  resetFaults();

  sdb
    .prepare(`INSERT INTO portal_users (email, password, name) VALUES (?, ?, ?)`)
    .run(config.sandbox.portalUser, config.sandbox.portalPassword, "Priya Raman");

  const vendorIds = new Map<string, number>();
  for (const v of VENDORS) {
    const res = sdb
      .prepare(
        `INSERT INTO vendors (name, slug, email, payment_terms, category)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(v.name, v.slug, v.email, v.paymentTerms, v.category);
    vendorIds.set(v.slug, Number(res.lastInsertRowid));
  }

  for (const inv of INVOICES) {
    const vendor = VENDORS.find((v) => v.slug === inv.vendor)!;
    const tax = Math.round(inv.subtotalCents * inv.taxRate);
    const total = inv.subtotalCents + tax;
    const file = `${inv.number}.pdf`;

    const bytes = await renderInvoicePdf(inv, vendor);
    fs.writeFileSync(path.join(INVOICE_DIR, file), bytes);

    sdb
      .prepare(
        `INSERT INTO invoices (number, vendor_id, po_number, issue_date, due_date,
                               subtotal_cents, tax_cents, total_cents, currency, status, pdf_file)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?, ?)`,
      )
      .run(
        inv.number,
        vendorIds.get(inv.vendor)!,
        inv.po,
        inv.issue,
        inv.due,
        inv.subtotalCents,
        tax,
        total,
        inv.status,
        file,
      );
  }

  for (const b of EXISTING_BILLS) {
    sdb
      .prepare(
        `INSERT INTO bills (vendor_name, invoice_number, amount_cents, currency, due_date,
                            status, notes, created_by, created_at)
         VALUES (?, ?, ?, 'USD', ?, ?, ?, 'priya.raman', ?)`,
      )
      .run(
        b.vendorName,
        b.invoiceNumber,
        b.amountCents,
        b.dueDate,
        b.status,
        b.notes,
        Date.now() - 86_400_000 * 7,
      );
  }

  return { vendors: VENDORS.length, invoices: INVOICES.length, bills: EXISTING_BILLS.length };
}
