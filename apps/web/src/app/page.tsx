import { buttonVariants } from "@heroui/styles";
import Image from "next/image";
import NextLink from "next/link";

/**
 * Placeholder landing page. Deliberately has no wallet connect: this is the public
 * entry point, and the dashboard behind /dashboard is where an address is needed.
 */
export default function LandingPage() {
  return (
    <main className="relative flex min-h-dvh flex-1 flex-col items-center justify-center overflow-hidden px-6 text-center">
      {/* Both images are decoration -- empty alt plus aria-hidden keeps them out of the
          accessibility tree rather than announcing a filename. */}
      <Image
        src="/landing-bg-glow.png"
        alt=""
        aria-hidden
        fill
        priority
        sizes="100vw"
        className="pointer-events-none -z-10 object-cover"
      />
      <Image
        src="/landing-many-circles.png"
        alt=""
        aria-hidden
        width={2254}
        height={1664}
        sizes="(min-width: 768px) 70vw, 120vw"
        className="pointer-events-none absolute -top-1/3 -right-1/4 -z-10 w-[120%] max-w-none opacity-70 md:w-[70%]"
      />

      <p className="text-muted text-xs font-medium tracking-[0.2em] uppercase">
        Attestcoin Protocol
      </p>

      <h1 className="mt-4 max-w-3xl text-4xl font-semibold text-balance sm:text-6xl">
        Your credit history, portable across chains
      </h1>

      <p className="text-muted mt-6 max-w-xl text-base text-pretty">
        Real repayments on real lending protocols get attested onto Creditcoin — no bridge,
        no oracle operator. One passport your borrowing history follows you into.
      </p>

      <NextLink className={`${buttonVariants({ size: "lg" })} mt-10`} href="/dashboard">
        Open dashboard
      </NextLink>

      <p className="text-muted mt-16 text-xs">
        Placeholder — final copy and visuals pending.
      </p>
    </main>
  );
}
