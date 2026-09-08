"use client";

import { Card, Skeleton } from "@heroui/react";
import { useAccount } from "wagmi";
import { usePassportSources } from "@/hooks/usePassportSources";

export function SourceBreakdown() {
  const { isConnected } = useAccount();
  const { sources, isLoading } = usePassportSources();

  if (!isConnected) return null;

  const credited = sources.filter((s) => s.count > 0n).length;

  return (
    <Card className="border-default max-w-md border border-solid shadow-panel" variant="transparent">
      <Card.Header>
        <Card.Title>Sources</Card.Title>
        <Card.Description>
          Registered protocols that can credit this passport.
        </Card.Description>
      </Card.Header>

      <Card.Content className="flex flex-col gap-2">
        {isLoading ? (
          // Three rows because that is what the deployed registry holds; a different count
          // would make the list jump when the real one lands.
          [0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <Skeleton className="h-4 w-28 rounded" />
              <Skeleton className="h-4 w-32 rounded" />
            </div>
          ))
        ) : sources.length === 0 ? (
          // Log queries are the one call a public RPC may refuse outright, and an empty
          // registry is indistinguishable from a refused scan -- so this says both.
          <Card.Description>
            No sources registered, or this RPC would not serve the registration logs.
          </Card.Description>
        ) : (
          sources.map((s) => (
            <div key={s.sourceId} className="flex items-baseline justify-between gap-4 text-sm">
              <span className={s.count > 0n ? undefined : "text-muted"}>{s.label}</span>
              <span className="flex items-baseline gap-3">
                <span className="tabular-nums">
                  {s.count.toString()} repay{s.count === 1n ? "" : "s"}
                </span>
                <span className="text-muted w-24 text-right text-xs tabular-nums">
                  {s.lastAt > 0n
                    ? new Date(Number(s.lastAt) * 1000).toLocaleDateString()
                    : "never"}
                </span>
              </span>
            </div>
          ))
        )}
      </Card.Content>

      {sources.length > 0 ? (
        <Card.Footer>
          <Card.Description className="text-xs">
            {credited} of {sources.length} have credited this passport. Every source beyond
            the first adds diversity points, which is why spreading borrowing across
            protocols raises a score faster than repeating one.
          </Card.Description>
        </Card.Footer>
      ) : null}
    </Card>
  );
}
