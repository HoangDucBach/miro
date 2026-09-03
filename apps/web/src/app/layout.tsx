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
  title: "Miro — Credit Passport",
  description: "A portable, cross-chain credit score attested via the Attestcoin Protocol.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // HeroUI reads the theme from both the class and `data-theme`; it needs both set.
    <html
      lang="en"
      className={`light ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      data-theme="light"
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
