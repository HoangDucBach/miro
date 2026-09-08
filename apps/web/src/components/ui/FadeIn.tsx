"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

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
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
