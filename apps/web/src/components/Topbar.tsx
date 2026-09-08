"use client";

import { Button, Drawer, useOverlayState } from "@heroui/react";
import { HamburgerMenuIcon } from "@solar-icons/react/linear/hamburger-menu";
import { ConnectButton } from "@/components/ConnectButton";
import { BrandMark, NavLinks } from "@/components/Sidebar";
import { SidebarProfile } from "@/components/SidebarProfile";

/**
 * The wallet controls live here rather than in the rail: connected, ConnectButton is a
 * network Select plus an address plus a Disconnect button -- far wider than the 224px
 * rail, and it would either overflow or force the rail wide enough to crowd the content.
 */
export function Topbar() {
  const drawer = useOverlayState();

  return (
    <header className="flex items-center gap-4 px-1 py-1 md:px-2">
      {/* Below `md` there is no rail, so the brand and the drawer trigger surface here. */}
      <div className="flex items-center gap-2 md:hidden">
        <Button aria-label="Open navigation" size="sm" variant="ghost" onPress={drawer.open}>
          <HamburgerMenuIcon className="size-4" />
        </Button>
        <BrandMark className="h-5" />
      </div>

      <div className="ml-auto">
        <ConnectButton />
      </div>

      <Drawer.Backdrop isOpen={drawer.isOpen} onOpenChange={drawer.setOpen}>
        <Drawer.Content placement="left">
          <Drawer.Dialog>
            <Drawer.CloseTrigger />
            <Drawer.Header>
              <Drawer.Heading>
                <BrandMark className="h-5" />
              </Drawer.Heading>
            </Drawer.Header>
            <Drawer.Body>
              {/* Without closing on navigate the drawer stays open over the page it just
                  routed to -- the route changes underneath an unchanged overlay. */}
              <NavLinks onNavigate={drawer.close} />
            </Drawer.Body>
            {/* Below `md` there is no rail, so the account block would otherwise be
             * reachable nowhere. */}
            <Drawer.Footer>
              <SidebarProfile />
            </Drawer.Footer>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </header>
  );
}
