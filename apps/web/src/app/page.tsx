import { Typography } from "@heroui/react";
import { buttonVariants } from "@heroui/styles";
import { AltArrowRightIcon } from "@solar-icons/react/linear/alt-arrow-right";
import Image from "next/image";
import NextLink from "next/link";

/**
 * Public landing page. Deliberately has no wallet connect -- an address is only needed
 * behind /dashboard, and asking for one at the door costs visitors who have not read
 * anything yet.
 */
export default function LandingPage() {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden px-6">
      {/* Both images are decoration: an empty alt plus aria-hidden keeps a screen reader
       * from announcing a filename. They are authored on a light ground, so on the dark
       * default the glow reads as a warm haze rather than the bloom in the mockup. */}
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
        // invert() flips the dark strokes to light without touching alpha, so the 99%
        // transparent ground stays transparent and the arcs read on a dark page.
        className="pointer-events-none absolute -top-1/3 -right-1/4 -z-10 w-[120%] max-w-none opacity-40 invert md:w-[70%]"
      />

      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        {/* The lockup's wordmark is already the site name, so the mark alone would leave
         * the page without one in text. The alt carries it instead. */}
        <Image
          src="/Favicon.png"
          alt="Miro"
          width={512}
          height={512}
          priority
          // The asset carries ~35% transparent padding, so the box runs well past the mark.
          className="size-40 sm:size-52"
        />

        <Typography
          type="h1"
          align="center"
          weight="bold"
          className="max-w-4xl text-balance"
        >
          Your Credit, Everywhere You&rsquo;ve Earned It
        </Typography>

        <Typography
          type="body"
          color="muted"
          align="center"
          className="max-w-md text-pretty"
        >
          Deposit, borrow, repay, or lend — every action here also builds your{" "}
          <span className="text-accent">passport</span>.
        </Typography>
        {/* Decoration, so empty alt plus aria-hidden. Hidden below `md`, where the
         * viewport is short enough that it would push the CTA off-screen. */}
        <Image
          src="/coin-3d.png"
          alt=""
          aria-hidden
          width={800}
          height={800}
          className="pointer-events-none hidden size-40 md:block lg:size-48"
        />
      </div>

      <div className="flex flex-col items-center gap-8 pb-10">
        {/* Button's `render` prop types its props for HTMLButtonElement, so handing them
         * to next/link's anchor does not type-check. buttonVariants is the styling API
         * HeroUI exports for exactly this, and `.button svg` sizes the chevron for us.
         * tertiary, not secondary: both sit on --default, but secondary also sets
         * --button-fg to --accent-soft-foreground, tinting the label purple. */}
        <NextLink
          className={buttonVariants({ size: "lg", variant: "tertiary" })}
          href="/dashboard"
        >
          Explore the New Era of Credit Lending
          <AltArrowRightIcon />
        </NextLink>

        <Typography type="body-sm" color="muted" align="center">
          Miro Protocol | Passport Protocol - 2026
        </Typography>
      </div>
    </main>
  );
}
