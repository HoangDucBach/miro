/** Truncates a 0x address to head and tail, the form used wherever one is shown in UI. */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
