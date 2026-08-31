import Link from "next/link";
import { ConnectButton } from "@/components/ConnectButton";
import { ScoreCard } from "@/components/ScoreCard";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Miro — Credit Passport</h1>
        <ConnectButton />
      </div>

      <p className="text-sm text-muted-foreground">
        Real repayments on real lending protocols get attested onto Creditcoin via the
        Attestcoin Protocol — no bridge, no oracle operator. This is your portable score.
      </p>

      <ScoreCard />

      <Button variant="link" className="w-fit p-0" render={<Link href="/pool">Go to PassportPool →</Link>} />
    </main>
  );
}
