import { Link } from "@heroui/react";
import { linkVariants } from "@heroui/styles";
import NextLink from "next/link";
import { ConnectButton } from "@/components/ConnectButton";
import { ScoreCard } from "@/components/ScoreCard";

export default function Home() {
  // HeroUI's own <Link render={...}> types its render props against a span, which a
  // Next.js <Link> (an anchor) can't satisfy. The documented way to combine the two is
  // to style NextLink with the variant slots instead.
  const link = linkVariants();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Miro — Credit Passport</h1>
        <ConnectButton />
      </div>

      <p className="text-muted text-sm">
        Real repayments on real lending protocols get attested onto Creditcoin via the
        Attestcoin Protocol — no bridge, no oracle operator. This is your portable score.
      </p>

      <ScoreCard />

      <NextLink className={`${link.base()} w-fit`} href="/pool">
        Go to PassportPool
        <Link.Icon className={link.icon()} />
      </NextLink>
    </main>
  );
}
