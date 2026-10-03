import Link from "next/link";
import { bills as billRepo, money } from "@/sandbox/db";

export const dynamic = "force-dynamic";

export default function ErpHome() {
  const rows = billRepo.all();

  return (
    <>
      <header className="border-b border-slate-300 bg-slate-800 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Northwind Manufacturing
            </p>
            <h1 className="text-lg font-semibold">NimbusERP &mdash; Accounts Payable</h1>
          </div>
          <Link
            href="/sandbox/erp/bills/new"
            className="rounded bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-200"
          >
            New bill
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="overflow-hidden rounded border border-slate-300 bg-white">
          <table className="w-full text-sm">
            <caption className="sr-only">Accounts payable ledger</caption>
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Bill</th>
                <th className="px-4 py-3 font-semibold">Supplier</th>
                <th className="px-4 py-3 font-semibold">Invoice no.</th>
                <th className="px-4 py-3 font-semibold">Due</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rows.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/sandbox/erp/bills/${b.id}`}
                      className="font-medium text-blue-700 underline"
                    >
                      BILL-{String(b.id).padStart(4, "0")}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{b.vendorName}</td>
                  <td className="px-4 py-3 font-mono text-xs">{b.invoiceNumber}</td>
                  <td className="px-4 py-3 tabular-nums">{b.dueDate}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        "rounded px-2 py-0.5 text-xs font-medium " +
                        (b.status === "paid"
                          ? "bg-slate-100 text-slate-700"
                          : "bg-amber-100 text-amber-800")
                      }
                    >
                      {b.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {money(b.amountCents, b.currency)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    The ledger is empty.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-slate-500">
          This ledger is also exposed read/write at{" "}
          <code className="rounded bg-slate-200 px-1 py-0.5">/api/sandbox/erp/bills</code>. The
          verifier reads bills back through that API rather than through this page, so a run cannot
          pass by having merely clicked the right buttons.
        </p>
      </main>
    </>
  );
}
