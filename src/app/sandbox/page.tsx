import Link from "next/link";

export default function SandboxIndex() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <h1 className="text-2xl font-semibold">Northwind Manufacturing &mdash; internal tooling</h1>
      <p className="mt-2 text-sm text-slate-600">
        Two applications stand in for the systems an accounts-payable clerk would move between.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/sandbox/portal"
          className="block rounded border border-slate-300 bg-white p-5 hover:border-slate-500"
        >
          <h2 className="font-semibold">Vendor Invoice Portal</h2>
          <p className="mt-1 text-sm text-slate-600">
            Login-protected. Lists supplier invoices with downloadable PDFs.
          </p>
          <p className="mt-3 font-mono text-xs text-slate-500">/sandbox/portal</p>
        </Link>

        <Link
          href="/sandbox/erp"
          className="block rounded border border-slate-300 bg-white p-5 hover:border-slate-500"
        >
          <h2 className="font-semibold">NimbusERP</h2>
          <p className="mt-1 text-sm text-slate-600">
            Accounts-payable ledger. Bills are entered here and exposed over a REST API.
          </p>
          <p className="mt-3 font-mono text-xs text-slate-500">/sandbox/erp</p>
        </Link>
      </div>
    </main>
  );
}
