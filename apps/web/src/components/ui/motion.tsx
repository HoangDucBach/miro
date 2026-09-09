"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** One curve for everything, so nothing moves in a different accent. */
const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Route content entering and leaving.
 *
 * `mode="wait"` holds the incoming route until the outgoing one has left; without it the
 * two overlap and the page visibly jumps. The key is the pathname, which is what tells
 * AnimatePresence a *different* page arrived rather than the same one re-rendering --
 * without it there is no exit at all, which is the state this replaces.
 *
 * `initial={false}` suppresses the animation on first paint: a full page load already has
 * its own transition, and animating on top of it reads as jank.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduced = useReducedMotion();

  if (reduced) return <>{children}</>;

  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.div
        key={pathname}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        initial={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.22, ease: EASE }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Swapping one panel for another in place -- shorter travel than a route change, because
 * the chrome around it stays put and only the contents move.
 */
export function PanelSwap({ children, panelKey }: { children: ReactNode; panelKey: string }) {
  const reduced = useReducedMotion();

  if (reduced) return <>{children}</>;

  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.div
        key={panelKey}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        initial={{ opacity: 0, y: 6 }}
        transition={{ duration: 0.16, ease: EASE }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * The moving highlight behind the active nav item. A shared `layoutId` makes motion
 * interpolate one element between positions rather than cross-fading two, so the pill
 * slides from the old row to the new one.
 */
export function NavHighlight({ isActive }: { isActive: boolean }) {
  const reduced = useReducedMotion();

  if (!isActive) return null;
  if (reduced) return <span className="bg-default absolute inset-0 rounded-lg" />;

  return (
    <motion.span
      className="bg-default absolute inset-0 rounded-lg"
      layoutId="nav-highlight"
      transition={{ duration: 0.2, ease: EASE }}
    />
  );
}

/** A list whose children arrive one after another rather than all at once. */
export function Stagger({ children, delay = 0.04 }: { children: ReactNode; delay?: number }) {
  const reduced = useReducedMotion();

  if (reduced) return <>{children}</>;

  return (
    <motion.div
      animate="shown"
      initial="hidden"
      variants={{ shown: { transition: { staggerChildren: delay } } }}
    >
      {children}
    </motion.div>
  );
}

/** One row of a Stagger. Meaningless outside one -- the parent drives the timing. */
export function StaggerItem({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();

  if (reduced) return <>{children}</>;

  return (
    <motion.div
      transition={{ duration: 0.2, ease: EASE }}
      variants={{ hidden: { opacity: 0, y: 6 }, shown: { opacity: 1, y: 0 } }}
    >
      {children}
    </motion.div>
  );
}
