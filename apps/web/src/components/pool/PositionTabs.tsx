"use client";

import { Tabs } from "@heroui/react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { SwapIn } from "@/components/ui/FadeIn";

const TAB_IDS = ["collateral", "loan"] as const;
type TabId = (typeof TAB_IDS)[number];

function isTabId(value: string | null): value is TabId {
  return value !== null && TAB_IDS.includes(value as TabId);
}

/**
 * Collateral/Loan, with the selection held in `?tab=` rather than in component state, so
 * the two halves of the position are separately linkable and survive a reload.
 *
 * useSearchParams is why this is its own component: on a prerendered route it forces
 * everything up to the nearest Suspense boundary to render on the client, so the page
 * keeps it behind one instead of giving up prerendering for the whole view.
 */
export function PositionTabs({ collateral, loan }: { collateral: ReactNode; loan: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // An unknown or absent ?tab= falls back rather than showing nothing, so a hand-edited
  // URL cannot leave the page blank.
  const requested = searchParams.get("tab");
  const selected: TabId = isTabId(requested) ? requested : "collateral";

  return (
    <Tabs
      selectedKey={selected}
      onSelectionChange={(key) => {
        // replace, not push: flipping between two halves of one view is not a step
        // someone wants to walk back through with the browser's Back button. scroll:false
        // keeps the page from jumping to the top on every switch.
        router.replace(`/dashboard/pool?tab=${String(key)}`, { scroll: false });
      }}
    >
      <Tabs.ListContainer className="w-fit">
        <Tabs.List aria-label="Position">
          <Tabs.Tab id="collateral">
            Collateral
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="loan">
            Loan
            <Tabs.Indicator />
          </Tabs.Tab>
        </Tabs.List>
      </Tabs.ListContainer>

      <Tabs.Panel className="pt-4" id="collateral">
        <SwapIn motionKey="collateral">{collateral}</SwapIn>
      </Tabs.Panel>
      <Tabs.Panel className="pt-4" id="loan">
        <SwapIn motionKey="loan">{loan}</SwapIn>
      </Tabs.Panel>
    </Tabs>
  );
}
