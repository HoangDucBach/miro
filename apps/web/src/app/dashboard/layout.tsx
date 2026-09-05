import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    // Column below `md` (topbar over content), row above it (rail beside content).
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <Sidebar />
      {/* min-w-0: without it the pool page's form grid sets the flex item's min width to
          its content and pushes the layout wider than the viewport instead of wrapping. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        {children}
      </div>
    </div>
  );
}
