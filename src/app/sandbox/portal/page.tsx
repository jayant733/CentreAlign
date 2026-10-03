import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { portalAuth, invoices as invoiceRepo, vendors as vendorRepo, money } from "@/sandbox/db";
import { CookieBanner } from "./CookieBanner";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 5;

type Sort = "number" | "issue_date" | "due_date";

export default async function PortalHome({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; vendor?: string; sort?: string }>;
}) {
  const jar = await cookies();
  const user = portalAuth.session(jar.get("nw_portal_session")?.value);
  if (!user) redirect("/sandbox/portal/login");

  const sp = await searchParams;
  // Default ordering is by invoice number, which is NOT the same ordering as
  // by date. An agent asked for "the latest invoice" has to realise this.
  const sort: Sort =
    sp.sort === "issue_date" || sp.sort === "due_date" ? sp.sort : "number";
  const vendorFilter = sp.vendor ?? "";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const allVendors = vendorRepo.all();
  let rows = invoiceRepo.all();

  if (vendorFilter) {
    rows = rows.filter((i) => i.vendorName === vendorFilter);
  }

  rows.sort((a, b) => {
    if (sort === "number") return a.number.localeCompare(b.number);
    if (sort === "issue_date") return b.issueDate.localeCompare(a.issueDate);
    return a.dueDate.localeCompare(b.dueDate);
  });

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const clamped = Math.min(page, totalPages);
  const pageRows = rows.slice((clamped - 1) * PAGE_SIZE, clamped * PAGE_SIZE);

  const qs = (over: Record<string, string | number>) => {
    const p = new URLSearchParams();
    if (vendorFilter) p.set("vendor", vendorFilter);
    if (sort !== "number") p.set("sort", sort);
    if (clamped !== 1) p.set("page", String(clamped));
    for (const [k, v] of Object.entries(over)) {
      if (v === "" ) p.delete(k);
      else p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `/sandbox/portal?${s}` : "/sandbox/portal";
  };

  return (
    <>
      <CookieBanner />
      <header className="border-b border-slate-300 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Northwind Manufacturing
            </p>
            <h1 className="text-lg font-semibold">Vendor Invoice Portal</h1>
          </div>
          <p className="text-sm text-slate-600">
            Signed in as <span className="font-medium">{user.name}</span>
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <form method="GET" action="/sandbox/portal" className="mb-5 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="vendor" className="block text-xs font-medium text-slate-600">
              Supplier
            </label>
            <select
              id="vendor"
              name="vendor"
              defaultValue={vendorFilter}
              className="mt-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">All suppliers</option>
              {allVendors.map((v) => (
                <option key={v.id} value={v.name}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sort" className="block text-xs font-medium text-slate-600">
              Sort by
            </label>
            <select
              id="sort"
              name="sort"
              defaultValue={sort}
              className="mt-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="number">Invoice number</option>
              <option value="issue_date">Invoice date (newest first)</option>
              <option value="due_date">Due date (soonest first)</option>
            </select>
          </div>
          <button
            type="submit"
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Apply filters
          </button>
        </form>

        <div className="overflow-hidden rounded border border-slate-300 bg-white">
          <table className="w-full text-sm">
            <caption className="sr-only">Supplier invoices</caption>
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Invoice</th>
                <th className="px-4 py-3 font-semibold">Supplier</th>
                <th className="px-4 py-3 font-semibold">Invoice date</th>
                <th className="px-4 py-3 font-semibold">Due date</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Net (excl. tax)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {pageRows.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/sandbox/portal/invoices/${inv.number}`}
                      className="font-medium text-blue-700 underline"
                    >
                      {inv.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{inv.vendorName}</td>
                  <td className="px-4 py-3 tabular-nums">{inv.issueDate}</td>
                  <td className="px-4 py-3 tabular-nums">{inv.dueDate}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        "rounded px-2 py-0.5 text-xs font-medium " +
                        (inv.status === "overdue"
                          ? "bg-red-100 text-red-800"
                          : inv.status === "paid"
                            ? "bg-slate-100 text-slate-700"
                            : "bg-emerald-100 text-emerald-800")
                      }
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {money(inv.subtotalCents, inv.currency)}
                  </td>
                </tr>
              ))}
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No invoices match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Amounts shown are net of tax. The total payable is stated on each invoice PDF.
        </p>

        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
          <p className="text-slate-600">
            Showing {pageRows.length} of {rows.length} invoices &mdash; page {clamped} of {totalPages}
          </p>
          <div className="flex gap-2">
            {clamped > 1 ? (
              <Link
                href={qs({ page: clamped - 1 })}
                className="rounded border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50"
              >
                Previous
              </Link>
            ) : null}
            {clamped < totalPages ? (
              <Link
                href={qs({ page: clamped + 1 })}
                className="rounded border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50"
              >
                Next page
              </Link>
            ) : null}
          </div>
        </nav>
      </main>
    </>
  );
}
