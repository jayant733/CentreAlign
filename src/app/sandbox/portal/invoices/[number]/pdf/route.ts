import fs from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { portalAuth, invoices as invoiceRepo, shouldInjectFault, audit } from "@/sandbox/db";
import { config } from "@/agent/config";

export const runtime = "nodejs";

const INVOICE_DIR = path.join(config.dataDir, "sandbox", "invoices");

/**
 * Serves the invoice PDF, but fails with a 503 the first time each invoice is
 * requested. The failure is tracked in the database rather than sampled at
 * random, so the agent's retry path is exercised on *every* run and in the
 * eval suite — a flaky dependency you can reproduce is worth far more than one
 * you cannot.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ number: string }> },
) {
  const jar = await cookies();
  const user = portalAuth.session(jar.get("nw_portal_session")?.value);
  if (!user) {
    return new Response("Unauthorized. Sign in to the portal to download invoices.", {
      status: 401,
    });
  }

  const { number } = await params;
  const invoiceNumber = decodeURIComponent(number);
  const inv = invoiceRepo.byNumber(invoiceNumber);
  if (!inv?.pdfFile) {
    return new Response("Invoice not found.", { status: 404 });
  }

  if (shouldInjectFault(`pdf:${inv.number}`, 1)) {
    audit.log("portal", "pdf_fault_injected", user.email, inv.number);
    return new Response(
      "Document service temporarily unavailable (cold storage retrieval). Please retry in a moment.",
      { status: 503, headers: { "Retry-After": "1" } },
    );
  }

  const file = path.join(INVOICE_DIR, inv.pdfFile);
  if (!fs.existsSync(file)) {
    return new Response("Invoice PDF is missing from storage. Run `npm run seed`.", { status: 404 });
  }

  audit.log("portal", "pdf_downloaded", user.email, inv.number);
  const bytes = fs.readFileSync(file);
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${inv.pdfFile}"`,
      "Cache-Control": "no-store",
    },
  });
}
