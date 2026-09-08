"use client";

import { Skeleton } from "@heroui/react";
import type { ReactNode } from "react";

/**
 * Holds a value's place with a skeleton of the same height while it loads, so a figure
 * arriving does not shift the layout under the reader.
 *
 * Skeletons sit at the value, not around whole cards: replacing a card wholesale makes
 * every heading and label flash too, which reads as the page reloading rather than a
 * number filling in.
 */
export function Loadable({
  isLoading,
  className,
  children,
}: {
  isLoading: boolean;
  /** Match the height and rough width of the value being replaced. */
  className: string;
  children: ReactNode;
}) {
  return isLoading ? <Skeleton className={className} /> : <>{children}</>;
}
