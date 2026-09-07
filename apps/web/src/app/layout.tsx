import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // The template applies to nested pages that set their own title; the landing keeps the
  // absolute form, since "Miro — Miro" would be the alternative.
  title: {
    default: "Miro — Your credit, everywhere you've earned it",
    template: "%s — Miro",
  },
  description:
    "Deposit, borrow, repay, or lend. Every action builds a portable credit passport, " +
    "attested on Creditcoin via the Passport Protocol — no bridge, no oracle operator.",
  applicationName: "Miro Protocol",
  openGraph: {
    type: "website",
    siteName: "Miro Protocol",
    title: "Miro — Your credit, everywhere you've earned it",
    description:
      "A portable, cross-chain credit passport built from real repayments on real lending protocols.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // HeroUI reads the theme from both the class and `data-theme`; it needs both set.
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      data-theme="dark"
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
