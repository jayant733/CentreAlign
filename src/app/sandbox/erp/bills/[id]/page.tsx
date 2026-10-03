import Link from "next/link";
import { notFound } from "next/navigation";
import { bills as billRepo, payments as paymentRepo, money } from "@/sandbox/db";

export const dynamic = "force-dynamic";

export default async function BillDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;
  const bill = billRepo.get(Number(id));
  if (!bill) notFound();
  const pays = paymentRepo.forBill(bill.id);

  const field = (label: string, value: string) => (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );

  return (
    <>
      <header className="border-b border-slate-300 bg-slate-800 text-white">
        <div className="mx-auto max-w-3xl px-6 py-3">
          <h1 className="text-lg font-semibold">NimbusERP &mdash; Bill detail</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <Link href="/sandbox/erp" className="text-sm text-blue-700 underline">
          &larr; Back to ledger
        </Link>

        {created ? (
          <div
            role="status"
            className="mt-4 rounded border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          >
            Bill saved successfully. Reference{" "}
            <strong>BILL-{String(bill.id).padStart(4, "0")}</strong>.
          </div>
        ) : null}

        <div className="mt-4 rounded border border-slate-300 bg-white p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold">BILL-{String(bill.id).padStart(4, "0")}</h2>
              <p className="mt-1 text-sm text-slate-600">{bill.vendorName}</p>
            </div>
            <span
              className={
                "rounded px-2 py-1 text-xs font-medium " +
                (bill.status === "paid"
                  ? "bg-slate-100 text-slate-700"
                  : "bg-amber-100 text-amber-800")
              }
            >
              {bill.status}
            </span>
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3">
            {field("Invoice number", bill.invoiceNumber)}
            {field("Amount payable", money(bill.amountCents, bill.currency))}
            {field("Due date", bill.dueDate)}
            {field("Entered by", bill.createdBy)}
            {field("Entered at", new Date(bill.createdAt).toISOString().slice(0, 16).replace("T", " "))}
            {field("Currency", bill.currency)}
          </dl>

          {bill.notes ? (
            <div className="mt-6 border-t border-slate-200 pt-5">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Notes
              </dt>
              <dd className="mt-1 text-sm whitespace-pre-wrap">{bill.notes}</dd>
            </div>
          ) : null}

          {pays.length > 0 ? (
            <div className="mt-6 border-t border-slate-200 pt-5">
              <h3 className="text-sm font-semibold">Payments</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {pays.map((p) => (
                  <li key={String(p.id)} className="font-mono text-xs">
                    {String(p.reference)} &mdash; {money(Number(p.amount_cents))} &mdash; approved by{" "}
                    {String(p.approved_by)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </main>
    </>
  );
}
