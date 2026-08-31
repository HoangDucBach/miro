import Link from "next/link";
import { ConnectButton } from "@/components/ConnectButton";
import { ScoreCard } from "@/components/ScoreCard";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Miro — Credit Passport</h1>
        <ConnectButton />
      </div>

      <p className="text-sm text-black/60 dark:text-white/60">
        Real repayments on real lending protocols get attested onto Creditcoin via the
        Attestcoin Protocol — no bridge, no oracle operator. This is your portable score.
      </p>

      <ScoreCard />

      <Link href="/pool" className="text-sm font-medium underline underline-offset-4">
        Go to PassportPool →
      </Link>
    </main>
  );
}
