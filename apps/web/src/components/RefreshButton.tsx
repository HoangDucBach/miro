"use client";

import { Button, Tooltip } from "@heroui/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshIcon } from "@solar-icons/react/linear/refresh";

/**
 * Re-reads everything on screen without reloading the page. A browser reload is the
 * wrong tool here: it tears down the wallet session and re-runs the registry scan, when
 * all that was wanted was the current on-chain figures.
 *
 * invalidateQueries rather than refetchQueries: it ignores staleTime, so the one query
 * that opts out of polling (the source registry scan) refreshes here too.
 */
export function RefreshButton() {
  const queryClient = useQueryClient();
  // Local, not useIsFetching: the background polling would spin this every fifteen
  // seconds, and a control that animates on its own reads as broken rather than live.
  const [refreshing, setRefreshing] = useState(false);

  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger>
        <Button
          aria-label="Refresh on-chain data"
          isIconOnly
          size="sm"
          variant="ghost"
          onPress={async () => {
            setRefreshing(true);
            try {
              await queryClient.invalidateQueries();
            } finally {
              setRefreshing(false);
            }
          }}
        >
          <RefreshIcon className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content placement="bottom">Refresh on-chain data</Tooltip.Content>
    </Tooltip>
  );
}
