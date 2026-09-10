import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";
import { Providers } from "@/components/providers";
import { wagmiConfig } from "@/lib/wagmi";
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

/**
 * A cookie wagmi cannot parse -- written by an older build, or re-encoded by a proxy --
 * must cost the visitor a reconnect, not the whole page: without this guard one bad
 * cookie is a 500 on every route until it expires.
 */
function initialWagmiState(cookie: string | null) {
  try {
    return cookieToInitialState(wagmiConfig, cookie);
  } catch {
    return undefined;
  }
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Reading the request makes every route dynamic. That is the trade: a dapp whose every
  // page depends on the connected wallet gains nothing from prerendering, and loses the
  // wallet on each reload without this.
  const initialState = initialWagmiState((await headers()).get("cookie"));

  return (
    // HeroUI reads the theme from both the class and `data-theme`; it needs both set.
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      data-theme="dark"
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers initialState={initialState}>{children}</Providers>
      </body>
    </html>
  );
}
