"use client";

import { IdCard, Landmark } from "lucide-react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";

const routes = [
  { href: "/dashboard", label: "Passport", icon: IdCard },
  { href: "/dashboard/pool", label: "PassportPool", icon: Landmark },
] as const;

/**
 * `/dashboard` is a prefix of every route nested under it, so matching by prefix alone
 * would leave the index entry permanently highlighted. The index matches exactly; the
 * rest match by prefix, so a future `/dashboard/pool/[id]` still lights its parent up.
 */
function isActive(pathname: string, href: string): boolean {
  return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
}

/**
 * Rendered twice -- once in the desktop rail, once inside the mobile drawer -- so the two
 * placements can never drift out of sync as routes are added.
 */
export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {routes.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);

        return (
          <NextLink
            key={href}
            href={href}
            onClick={onNavigate}
            // The highlight is purely visual; aria-current is what carries it to a screen reader.
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-default text-foreground font-medium"
                : "text-muted hover:bg-default hover:text-foreground"
            }`}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </NextLink>
        );
      })}
    </nav>
  );
}

/** Desktop-only rail. Below `md` the same links live in Topbar's drawer instead. */
export function Sidebar() {
  return (
    <aside className="border-default hidden w-56 shrink-0 flex-col gap-6 border-r px-3 py-6 md:flex">
      <NextLink href="/" className="px-3 text-sm font-semibold">
        Miro
      </NextLink>
      <NavLinks />
    </aside>
  );
}
