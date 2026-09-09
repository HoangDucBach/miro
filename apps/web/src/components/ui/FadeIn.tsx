"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/** One easing curve for every transition, so nothing moves in a different accent. */
const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * A short rise-and-fade for content arriving on a route. Deliberately one effect used in
 * one way: motion here is meant to soften a page appearing, not to be noticed.
 *
 * Honours prefers-reduced-motion by rendering the final state outright -- for a reader who
 * has asked the OS for less movement, a transform is the part to drop, not just shorten.
 */
export function FadeIn({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const reduced = useReducedMotion();

  if (reduced) return <>{children}</>;

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      initial={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.28, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Swaps one panel for another without the layout jumping: a shorter travel than FadeIn,
 * because the surrounding chrome stays put and only the contents change.
 *
 * `key` is what tells motion this is a different panel rather than the same one
 * re-rendering -- without it the exit animation never runs.
 */
export function SwapIn({ children, motionKey }: { children: ReactNode; motionKey: string }) {
  const reduced = useReducedMotion();

  if (reduced) return <>{children}</>;

  return (
    <motion.div
      key={motionKey}
      animate={{ opacity: 1, y: 0 }}
      initial={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.18, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
