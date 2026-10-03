import Link from "next/link";
import { vendors as vendorRepo } from "@/sandbox/db";

export const dynamic = "force-dynamic";

export default async function NewBill({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const asArray = (v: string | string[] | undefined) =>
    v === undefined ? [] : Array.isArray(v) ? v : [v];
  const errors = asArray(sp.err);
  const value = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");

  const allVendors = vendorRepo.all();

  return (
    <>
      <header className="border-b border-slate-300 bg-slate-800 text-white">
        <div className="mx-auto max-w-3xl px-6 py-3">
          <h1 className="text-lg font-semibold">NimbusERP &mdash; New bill</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <Link href="/sandbox/erp" className="text-sm text-blue-700 underline">
          &larr; Back to ledger
        </Link>

        <form
          method="POST"
          action="/api/sandbox/erp/bills/form"
          className="mt-4 space-y-5 rounded border border-slate-300 bg-white p-6"
        >
          {errors.length > 0 ? (
            <div
              role="alert"
              className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              <p className="font-semibold">The bill could not be saved:</p>
              <ul className="mt-1 list-inside list-disc space-y-1">
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <label htmlFor="vendorName" className="block text-sm font-medium">
              Supplier <span className="text-red-600">*</span>
            </label>
            <select
              id="vendorName"
              name="vendorName"
              defaultValue={value("vendorName")}
              required
              className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Select a supplier…</option>
              {allVendors.map((v) => (
                <option key={v.id} value={v.name}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="invoiceNumber" className="block text-sm font-medium">
              Supplier invoice number <span className="text-red-600">*</span>
            </label>
            <input
              id="invoiceNumber"
              name="invoiceNumber"
              defaultValue={value("invoiceNumber")}
              required
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-slate-500">Must be unique across the ledger.</p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="amount" className="block text-sm font-medium">
                Total amount payable <span className="text-red-600">*</span>
              </label>
              <input
                id="amount"
                name="amount"
                defaultValue={value("amount")}
                required
                inputMode="decimal"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">
                Plain number only, e.g. <code>18415.49</code>. No currency symbols or commas.
              </p>
            </div>

            <div>
              <label htmlFor="dueDate" className="block text-sm font-medium">
                Payment due date <span className="text-red-600">*</span>
              </label>
              <input
                id="dueDate"
                name="dueDate"
                defaultValue={value("dueDate")}
                required
                placeholder="YYYY-MM-DD"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">
                ISO format only, e.g. <code>2026-10-22</code>.
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              defaultValue={value("notes")}
              rows={3}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex gap-3 border-t border-slate-200 pt-5">
            <button
              type="submit"
              className="rounded bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Save bill
            </button>
            <Link
              href="/sandbox/erp"
              className="rounded border border-slate-300 px-5 py-2 text-sm hover:bg-slate-50"
            >
              Cancel
            </Link>
          </div>
        </form>
      </main>
    </>
  );
}
