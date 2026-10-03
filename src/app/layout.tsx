import type { Metadata } from "next";
import {
  Big_Shoulders,
  Big_Shoulders_Stencil,
  JetBrains_Mono,
  Schibsted_Grotesk,
} from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const shoulders = Big_Shoulders({
  variable: "--font-shoulders",
  subsets: ["latin"],
  weight: ["600", "800", "900"],
});

const stencil = Big_Shoulders_Stencil({
  variable: "--font-shoulders-stencil",
  subsets: ["latin"],
  weight: ["700", "900"],
});

const schibsted = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Praxis — the AI worker that proves its work",
  description:
    "Give Praxis a task in plain language. It plans, does the work in real systems, recovers from failures, and verifies the result independently.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${shoulders.variable} ${stencil.variable} ${schibsted.variable} ${jetbrains.variable} h-full`}
    >
      <body className="min-h-full">
        <div
          hidden
          dangerouslySetInnerHTML={{
            __html: `<!--
THESIS: An AI worker whose output is a case file, not a chat log. Refuses the glowing-orb agent dashboard.
OWN-WORLD: Dim evidence room, one lamp. Warm graphite ground, manila/kraft exhibit tags, frosted evidence bags, stamped seals. Amber tape = needs you, seal green = verified, oxide = failed.
STORY: The visitor sees a task become numbered exhibits, watches the worker gather proof, and opens a case of their own.
FIRST VIEWPORT: 3D lamp-lit table, exhibits bagged and tagged in sequence; condensed headline left; "Open a case" primary action under it.
FORM: Evidence room / chain of custody, grounded candidate 7. Seed 50b388fc.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`,
          }}
        />
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--color-bench)",
              border: "1px solid var(--color-seam)",
              color: "var(--color-ink)",
              fontFamily: "var(--font-sans)",
            },
          }}
        />
      </body>
    </html>
  );
}
