import { vendors } from "@/sandbox/db";
import { seedSandbox, writeInvoiceFiles } from "@/sandbox/seed";

/**
 * Container start. A full seed wipes the ledger, so it only runs when Neon
 * has no vendors yet. Invoice PDFs live on disk, so they are rewritten every
 * start even when the database is already filled.
 */
async function main() {
  const count = vendors.all().length;
  if (count === 0) {
    const result = await seedSandbox();
    console.log(
      `Seeded sandbox: ${result.vendors} vendors, ${result.invoices} invoices, ` +
        `${result.bills} existing ERP bills.`,
    );
    return;
  }
  const files = await writeInvoiceFiles();
  console.log(`Sandbox already has ${count} vendors. Rewrote ${files} invoice PDFs.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
