import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { portalAuth, invoices as invoiceRepo, vendors as vendorRepo, money } from "@/sandbox/db";
import { CookieBanner } from "../../CookieBanner";

export const dynamic = "force-dynamic";

export default async function InvoiceDetail({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const jar = await cookies();
  const user = portalAuth.session(jar.get("nw_portal_session")?.value);
  const { number } = await params;
  if (!user) redirect(`/sandbox/portal/login?next=/sandbox/portal/invoices/${number}`);

  const inv = invoiceRepo.byNumber(decodeURIComponent(number));
  if (!inv) notFound();
  const vendor = vendorRepo.all().find((v) => v.id === inv.vendorId)!;

  const field = (label: string, value: string) => (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );

  return (
    <>
      <CookieBanner />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <Link href="/sandbox/portal" className="text-sm text-blue-700 underline">
          &larr; Back to all invoices
        </Link>

        <div className="mt-4 rounded border border-slate-300 bg-white p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-semibold">{inv.number}</h1>
              <p className="mt-1 text-sm text-slate-600">{inv.vendorName}</p>
            </div>
            <span
              className={
                "rounded px-2 py-1 text-xs font-medium " +
                (inv.status === "overdue"
                  ? "bg-red-100 text-red-800"
                  : inv.status === "paid"
                    ? "bg-slate-100 text-slate-700"
                    : "bg-emerald-100 text-emerald-800")
              }
            >
              {inv.status}
            </span>
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3">
            {field("Invoice date", inv.issueDate)}
            {field("Payment due", inv.dueDate)}
            {field("Terms", vendor.paymentTerms)}
            {field("Purchase order", inv.poNumber ?? "—")}
            {field("Supplier contact", vendor.email)}
            {field("Currency", inv.currency)}
          </dl>

          <div className="mt-6 border-t border-slate-200 pt-5">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Net amount (excluding tax)
            </dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {money(inv.subtotalCents, inv.currency)}
            </dd>
            <p className="mt-2 text-sm text-slate-600">
              Tax is calculated by the supplier. The{" "}
              <strong>total amount payable is stated on the invoice PDF</strong> and is the figure
              that must be entered into the accounts-payable ledger.
            </p>
          </div>

          <div className="mt-6 flex gap-3">
            <a
              href={`/sandbox/portal/invoices/${encodeURIComponent(inv.number)}/pdf`}
              className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Download invoice PDF
            </a>
            <Link
              href="/sandbox/portal"
              className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
            >
              Back
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
