import Image from "next/image";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <>
      {/* Ambient wash behind the whole dashboard: pure white at alpha 15/255, so it reads
       * only against the dark ground. Fixed rather than absolute -- it is lighting, not
       * content, and should hold still while the page scrolls under it. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <Image
          alt=""
          className="object-cover"
          fill
          priority
          sizes="100vw"
          src="/dashboard-bg.png"
        />
      </div>

      {/* The padding is what makes the rail read as a panel floating on the page ground
          rather than a column welded to the viewport edge. Column below `md` (topbar over
          content), row above it (rail beside content). */}
      <div className="flex min-h-dvh flex-col gap-3 p-3 md:flex-row">
        <Sidebar />
        {/* min-w-0: without it the pool page's form grid sets the flex item's min width to
            its content and pushes the layout wider than the viewport instead of wrapping. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          {children}
        </div>
      </div>
    </>
  );
}
