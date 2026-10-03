import { seedSandbox, INVOICE_DIR } from "@/sandbox/seed";

async function main() {
  const result = await seedSandbox();
  console.log(
    `Seeded sandbox: ${result.vendors} vendors, ${result.invoices} invoices, ` +
      `${result.bills} existing ERP bills.`,
  );
  console.log(`Invoice PDFs written to ${INVOICE_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
