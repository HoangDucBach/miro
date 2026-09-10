import Image from "next/image";

/**
 * The mark of a source protocol, matched on the label's leading word so "Aave",
 * "Aave liquidation" and "Aave V3" all resolve to the same logo.
 *
 * Anything unrecognised falls back to the initial in a neutral circle rather than a broken
 * image: the source registry is open, so a protocol nobody has drawn a logo for is a
 * normal case, not an error.
 */
const LOGOS: Record<string, { src: string; alt: string }> = {
  aave: { src: "/protocols/aave.png", alt: "Aave" },
  morpho: { src: "/protocols/morpho.png", alt: "Morpho" },
};

export function ProtocolIcon({ name, className = "size-5" }: { name: string; className?: string }) {
  const logo = LOGOS[name.split(" ")[0]?.toLowerCase() ?? ""];

  if (!logo) {
    return (
      <span
        aria-hidden
        className={`bg-surface-secondary text-muted inline-flex shrink-0 items-center justify-center rounded-full text-[10px] font-medium ${className}`}
      >
        {name.charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <Image
      alt={logo.alt}
      className={`shrink-0 rounded-full ${className}`}
      height={40}
      src={logo.src}
      width={40}
    />
  );
}
