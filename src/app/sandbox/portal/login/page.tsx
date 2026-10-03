export const dynamic = "force-dynamic";

export default async function PortalLogin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <div className="rounded border border-slate-300 bg-white p-7 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Northwind Manufacturing
        </p>
        <h1 className="mt-1 text-xl font-semibold">Vendor Invoice Portal</h1>
        <p className="mt-2 text-sm text-slate-600">Sign in to view supplier invoices.</p>

        {error ? (
          <div
            role="alert"
            className="mt-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {error === "invalid"
              ? "Incorrect email or password. Please try again."
              : "Unable to sign in."}
          </div>
        ) : null}

        <form method="POST" action="/api/sandbox/portal/login" className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium">
              Work email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Sign in
          </button>
        </form>

        <p className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-500">
          Sandbox credentials are provisioned in <code>.env</code> and supplied to the agent through
          its credential store. They are not real.
        </p>
      </div>
    </main>
  );
}
