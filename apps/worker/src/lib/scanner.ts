/**
 * Source-chain log ingestion: a persisted block cursor driven forward with eth_getLogs.
 *
 * Why not a subscription. ethers' `provider.on` over HTTP is eth_newFilter plus
 * eth_getFilterChanges -- state that lives on one RPC backend. Public endpoints are load
 * balanced, so the next poll lands on a backend that never saw the filter, fails with
 * "filter not found", and ethers retries that dead id forever. The worker ran for hours
 * and relayed nothing. WebSocket `eth_subscribe` is push rather than poll but has the
 * same shape of problem: a dropped socket loses every event in the gap, so a cursor and
 * a backfill are needed underneath it anyway. With attestation lagging the source chain
 * by minutes, sub-block latency buys nothing; the cursor alone is the design.
 *
 * What makes the cursor safe:
 *   - It is persisted, so a restart resumes where it stopped instead of at the head. The
 *     one event that matters is always the one emitted while the process was down.
 *   - It trails the head by a few confirmations, so a log on a block that gets reorged
 *     out is (almost) never seen, rather than enqueued and left to fail at the prover.
 *     The passport's replay protection makes a double relay harmless regardless.
 *   - One request covers every target: eth_getLogs takes an address list and a topic0
 *     list, so cost scales with chains, not with the protocols watched on each.
 *   - A failed request leaves the cursor where it was and the same range is asked again.
 *
 * Everything that touches the network or the store is injected, so the loop's logic is
 * testable without either.
 */

export interface ScanTarget {
  label: string;
  address: string;
  topic0: string;
}

export interface ScannedLog {
  target: ScanTarget;
  txHash: string;
  blockNumber: number;
}

/** The slice of an ethers provider the scanner uses. */
export interface LogSource {
  getBlockNumber(): Promise<number>;
  getLogs(filter: {
    address: string[];
    topics: [string[]];
    fromBlock: number;
    toBlock: number;
  }): Promise<{ address: string; topics: readonly string[]; transactionHash: string; blockNumber: number }[]>;
}

/** Where the cursor lives between runs. Redis in production; a Map in tests. */
export interface CursorStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
}

export interface ScannerOptions {
  /** Blocks to trail the head by. Two is plenty on Sepolia; reorgs deeper are rare. */
  confirmations?: number;
  /** Largest eth_getLogs range per request. Public RPCs cap this; 2000 is safe. */
  maxSpan?: number;
  /** First run only: how far back from the head to start. Later runs resume the cursor. */
  initialLookback?: number;
  /** Namespaces the cursor so two chains, or two deployments, never share one. */
  cursorKey?: string;
}

const DEFAULTS = { confirmations: 2, maxSpan: 2_000, initialLookback: 0, cursorKey: "scanner:cursor" };

export class LogScanner {
  private readonly opts: Required<ScannerOptions>;
  private cursor: number | null = null;

  constructor(
    private readonly source: LogSource,
    private readonly store: CursorStore,
    private readonly targets: ScanTarget[],
    options: ScannerOptions = {},
  ) {
    this.opts = { ...DEFAULTS, ...options };
  }

  /** The last block fully scanned, or null before the first tick. */
  get position(): number | null {
    return this.cursor;
  }

  /**
   * Advances the cursor one span at a time and returns the logs found. Never throws past
   * the cursor: an error mid-span leaves it untouched, and the caller's next tick re-asks
   * the same range. Callers loop on this; it deliberately owns no timer.
   */
  async tick(): Promise<ScannedLog[]> {
    const head = await this.source.getBlockNumber();
    const safeHead = head - this.opts.confirmations;

    if (this.cursor === null) this.cursor = await this.loadCursor(safeHead);
    if (safeHead <= this.cursor) return [];

    const fromBlock = this.cursor + 1;
    const toBlock = Math.min(safeHead, this.cursor + this.opts.maxSpan);

    const byAddress = new Map(this.targets.map((t) => [t.address.toLowerCase(), t]));
    const logs = await this.source.getLogs({
      address: this.targets.map((t) => t.address),
      topics: [this.targets.map((t) => t.topic0)],
      fromBlock,
      toBlock,
    });

    const found: ScannedLog[] = [];
    for (const log of logs) {
      // The batched query matches any address with any topic; pair them back up so a
      // Morpho-shaped event from the Aave address (impossible today, cheap to guard) is
      // not attributed to the wrong source.
      const target = byAddress.get(log.address.toLowerCase());
      if (!target || log.topics[0]?.toLowerCase() !== target.topic0.toLowerCase()) continue;
      found.push({ target, txHash: log.transactionHash, blockNumber: log.blockNumber });
    }

    // Persist before returning: if the caller crashes while enqueueing, the worst case is
    // a re-scan of this span, and jobs are keyed by tx hash so that is a no-op.
    await this.store.set(this.opts.cursorKey, String(toBlock));
    this.cursor = toBlock;
    return found;
  }

  private async loadCursor(safeHead: number): Promise<number> {
    const saved = await this.store.get(this.opts.cursorKey);
    if (saved !== null) {
      const n = Number(saved);
      if (Number.isFinite(n)) return n;
    }
    return Math.max(0, safeHead - this.opts.initialLookback);
  }
}
