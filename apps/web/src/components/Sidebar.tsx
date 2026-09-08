"use client";

import { Button, Tooltip } from "@heroui/react";
import { IdCard, Landmark, PanelLeft } from "lucide-react";
import Image from "next/image";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

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
 * The lockup ships only in a "Dark" cut -- white wordmark, for dark grounds -- which is
 * all the app needs while dark is the default theme. A light-theme build needs a Light
 * cut here, not a filter.
 */
export function BrandMark({
  className = "h-6",
  variant = "lockup",
}: {
  className?: string;
  variant?: "lockup" | "mark";
}) {
  const isLockup = variant === "lockup";

  return (
    <NextLink aria-label="Miro home" className="w-fit shrink-0" href="/">
      <Image
        alt="Miro"
        className={`${className} w-auto`}
        // The lockup is 3:1; the mark is square. Passing each its own intrinsic size keeps
        // next/image from reserving the wrong box before the file loads.
        height={512}
        priority
        src={isLockup ? "/Logo/Dark.png" : "/Favicon.png"}
        width={isLockup ? 1536 : 512}
      />
    </NextLink>
  );
}

/**
 * Rendered in the desktop rail and again inside the mobile drawer, so the two placements
 * cannot drift apart as routes are added. `isCollapsed` only ever comes from the rail --
 * the drawer is always full width.
 */
export function NavLinks({
  isCollapsed = false,
  onNavigate,
}: {
  isCollapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {routes.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);

        const link = (
          <NextLink
            href={href}
            onClick={onNavigate}
            // The highlight is purely visual; aria-current is what carries it to a screen reader.
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg py-2 text-sm transition-colors ${
              isCollapsed ? "justify-center px-2" : "px-3"
            } ${
              active
                ? "bg-default text-foreground font-medium"
                : "text-muted hover:bg-default hover:text-foreground"
            }`}
          >
            <Icon className="size-4 shrink-0" />
            {/* Kept in the DOM rather than dropped: collapsed, the icon alone would leave
             * the link with no accessible name at all. */}
            <span className={isCollapsed ? "sr-only" : undefined}>{label}</span>
          </NextLink>
        );

        return isCollapsed ? (
          <Tooltip key={href} delay={0}>
            <Tooltip.Trigger>{link}</Tooltip.Trigger>
            <Tooltip.Content placement="right">{label}</Tooltip.Content>
          </Tooltip>
        ) : (
          <div key={href}>{link}</div>
        );
      })}
    </nav>
  );
}

/**
 * Desktop-only rail, floating clear of the viewport edges rather than filling them, so
 * the page ground reads behind it. Below `md` the same links live in Topbar's drawer.
 *
 * Collapsing is local state, not a cookie: the App Router keeps this layout mounted
 * across dashboard navigations, so it only resets on a full reload.
 */
export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside
      className={`border-default bg-surface sticky top-3 hidden h-[calc(100dvh-1.5rem)] shrink-0 flex-col gap-6 rounded-2xl border p-3 transition-[width] md:flex ${
        isCollapsed ? "w-[68px]" : "w-60"
      }`}
    >
      <div className={`flex items-center gap-2 ${isCollapsed ? "flex-col" : "justify-between"}`}>
        {/* The rail shows the mark alone -- at 68px collapsed there is no room for the
         * wordmark, and swapping assets mid-transition would flicker. */}
        <BrandMark className="size-6" variant="mark" />

        <Button
          isIconOnly
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          size="sm"
          variant="ghost"
          onPress={() => setIsCollapsed((v) => !v)}
        >
          <PanelLeft />
        </Button>
      </div>

      <NavLinks isCollapsed={isCollapsed} />
    </aside>
  );
}
