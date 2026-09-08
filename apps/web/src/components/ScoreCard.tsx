"use client";

import { Card, Separator } from "@heroui/react";
import { Loadable } from "@/components/ui/Loadable";
import { useAccount } from "wagmi";
import { usePassportDetail } from "@/hooks/usePassportDetail";
import { firstSeenDate, scoreBreakdown } from "@/lib/passport";

function Row({ label, working, points }: { label: string; working: string; points: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span>{label}</span>
      <span className="flex items-baseline gap-3">
        <span className="text-muted text-xs tabular-nums">{working}</span>
        <span className="w-12 text-right tabular-nums">{points}</span>
      </span>
    </div>
  );
}

export function ScoreCard() {
  const { isConnected } = useAccount();
  const { record, params, score, perSourceCap, nowSeconds, isLoading } = usePassportDetail();

  if (!isConnected) {
    return (
      <Card className="border-default shadow-panel border border-solid" variant="transparent">
        <Card.Header>
          <Card.Description>Connect a wallet to see your credit passport.</Card.Description>
        </Card.Header>
      </Card>
    );
  }

  // Aged against chain time, the same clock scoreOf uses. The headline still shows the
  // contract's own figure; these rows explain it rather than replace it.
  const breakdown = scoreBreakdown(record, params, nowSeconds);
  const seen = firstSeenDate(record.firstSeenAt);

  return (
    <Card
      className="border-default shadow-panel w-full gap-3 overflow-hidden border border-solid p-2"
      variant="transparent"
    >
      <div
        aria-hidden
        className="from-accent via-accent/70 to-accent/25 h-28 w-full rounded-2xl bg-linear-to-br"
      />

      <Card.Header className="gap-1 px-2">
        <Card.Description>Credit passport score</Card.Description>
        <Loadable className="h-12 w-28 rounded-xl" isLoading={isLoading}>
          <Card.Title className="text-5xl font-semibold tabular-nums">
            {score.toString()}
          </Card.Title>
        </Loadable>
      </Card.Header>

      {seen === null ? (
        <Card.Footer className="px-2 pb-1">
          <Card.Description>
            No passport yet — start borrowing and repaying to build one.
          </Card.Description>
        </Card.Footer>
      ) : (
        <>
          <Card.Content className="flex flex-col gap-2 px-2">
            <Separator />
            <Row
              label="Repayments counted"
              points={`+${breakdown.repay}`}
              working={`${record.cappedRepays} × ${params.repayPoints}`}
            />
            <Row
              label="Source diversity"
              points={`+${breakdown.diversity}`}
              working={
                record.sourceCount > 1n
                  ? `${record.sourceCount - 1n} × ${params.diversityPoints}`
                  : "needs a 2nd source"
              }
            />
            <Row
              label="Passport age"
              points={`+${breakdown.age}`}
              working={`${breakdown.agePeriods} × ${params.agePointsPerPeriod}`}
            />
            <Row
              label="Negative events"
              points={breakdown.penalty > 0n ? `−${breakdown.penalty}` : "0"}
              working={`${record.negativeEvents} × ${params.negativePenalty}`}
            />
          </Card.Content>

          <Card.Footer className="flex flex-col items-start gap-1 px-2 pb-1">
            <Card.Description>
              Open since {seen.toLocaleDateString()} · {record.sourceCount.toString()} source
              {record.sourceCount === 1n ? "" : "s"} reporting
            </Card.Description>
            <Card.Description className="text-xs">
              At most {perSourceCap.toString()} repayments count per source, and age stops
              accruing after {params.ageCapPeriods.toString()} periods — so the score
              rewards borrowing across protocols, not repeating one.
            </Card.Description>
          </Card.Footer>
        </>
      )}
    </Card>
  );
}
