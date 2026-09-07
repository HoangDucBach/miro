import type { Metadata } from "next";

// page.tsx here is a client component, and metadata may only be exported from a server
// one -- hence this layout rather than a `metadata` export beside the page.
export const metadata: Metadata = { title: "PassportPool" };

export default function PoolLayout({ children }: LayoutProps<"/dashboard/pool">) {
  return children;
}
