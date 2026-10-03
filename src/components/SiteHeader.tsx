import Link from "next/link";
import { ButtonLink, Wordmark } from "@/components/evidence";

export function SiteHeader() {
  return (
    <header className="absolute inset-x-0 top-0 z-30">
      <div className="mx-auto flex max-w-[1320px] items-center justify-between px-6 py-5 md:px-10">
        <Link href="/" aria-label="Praxis home" className="text-ink">
          <Wordmark />
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-1 text-[15px]">
          <Link href="/#case-file" className="hidden rounded px-3 py-2 text-ink-2 hover:text-ink sm:block">
            A real run
          </Link>
          <Link href="/runs" className="hidden rounded px-3 py-2 text-ink-2 hover:text-ink sm:block">
            Case files
          </Link>
          <Link href="/sandbox" className="hidden rounded px-3 py-2 text-ink-2 hover:text-ink md:block">
            Sandbox company
          </Link>
          <ButtonLink href="/mission" tone="quiet" className="ml-2 px-4 py-2">
            Open a case
          </ButtonLink>
        </nav>
      </div>
    </header>
  );
}
