"use client";

import { Button, Drawer, useOverlayState } from "@heroui/react";
import { Menu } from "lucide-react";
import { ConnectButton } from "@/components/ConnectButton";
import { BrandMark, NavLinks } from "@/components/Sidebar";

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
          <Menu className="size-4" />
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
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </header>
  );
}
