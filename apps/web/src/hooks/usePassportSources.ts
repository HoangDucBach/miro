import { useQuery } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { toEventSelector } from "viem";
import { useAccount, usePublicClient, useReadContracts } from "wagmi";
import { creditPassportAbi } from "@/generated";
import { cc3Testnet } from "@/lib/chains";
import { contracts, creditPassportDeployBlock } from "@/lib/contracts";

export interface PassportSource {
  sourceId: Hex;
  label: string;
  /** Repayments this borrower has had credited from this source. */
  count: bigint;
  /** Unix seconds of the most recent one, 0 if never. */
  lastAt: bigint;
}

/**
 * topic0 of the events the passport is configured to accept. Recomputed here rather than
 * imported from @miro/shared, whose events module pulls ethers into the client bundle for
 * the sake of one keccak call viem already does.
 */
const KNOWN_TOPICS: Record<string, string> = {
  [toEventSelector("Repay(address,address,address,uint256,bool)")]: "Aave",
  [toEventSelector("Repay(bytes32,address,address,uint256,uint256)")]: "Morpho",
  [toEventSelector("LiquidationCall(address,address,address,uint256,uint256,address,bool)")]:
    "Aave liquidation",
};

/**
 * Window size for the log scan. Measured against CC3's public RPC: 10k blocks answers
 * inside its 10-second cap, 20k does not. 5k leaves headroom for a busier chain.
 */
const CHUNK = 5_000n;

/** Used only when no deploy block is configured -- roughly a day of CC3 blocks. */
const FALLBACK_SPAN = 50_000n;

function shortAddr(a: Address) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/**
 * The passport's source registry, per borrower.
 *
 * `sources` is a mapping keyed by sourceId and `sourceStats` needs that key, so neither is
 * enumerable by reading state -- but every registration emits SourceSet or
 * LocalReporterSet, and those logs are enumerable. Reading the registry back out of its
 * own events is what makes a per-source breakdown possible without an indexer.
 *
 * The scan is chunked and bounded, not a single sweep. CC3's public RPC caps eth_getLogs
 * at a 10-second query, and measured against the live endpoint it refuses a 20k-block span
 * outright -- let alone the 5.4M blocks a `fromBlock: "earliest"` would ask for. So the
 * range starts at the passport's deploy block and is cut into windows the RPC will serve.
 *
 * Without a configured deploy block it falls back to a recent window, which still finds
 * lately-registered sources but can miss the original ones. A failed scan degrades to an
 * empty registry rather than taking the page down; the score above it does not depend on
 * this.
 */
export function usePassportSources() {
  const { address } = useAccount();
  const client = usePublicClient({ chainId: cc3Testnet.id });

  const { data: registry, isLoading: isScanning } = useQuery({
    queryKey: ["passport-sources", contracts.creditPassport],
    enabled: Boolean(client),
    // The registry only changes when an owner registers a protocol, so this is close to
    // static; re-scanning it on every mount would be a dozen RPC calls for nothing.
    staleTime: 30 * 60_000,
    // Opts out of the app-wide polling: a dozen eth_getLogs calls every fifteen seconds
    // for a registry that changes when an owner adds a protocol. The topbar's refresh
    // still forces it, via invalidateQueries.
    refetchInterval: false,
    retry: false,
    queryFn: async () => {
      if (!client) return { crossChain: [], localReporters: [] };

      const head = await client.getBlockNumber();
      const from = creditPassportDeployBlock ?? (head > FALLBACK_SPAN ? head - FALLBACK_SPAN : 0n);

      const windows: { fromBlock: bigint; toBlock: bigint }[] = [];
      for (let start = from; start <= head; start += CHUNK) {
        const end = start + CHUNK - 1n;
        windows.push({ fromBlock: start, toBlock: end > head ? head : end });
      }

      const scan = (name: "SourceSet" | "LocalReporterSet") =>
        Promise.all(
          windows.map((w) =>
            client.getLogs({
              address: contracts.creditPassport,
              event: creditPassportAbi.find(
                (e) => e.type === "event" && e.name === name,
              ) as never,
              ...w,
            }),
          ),
        ).then((pages) => pages.flat());

      const [sourceSet, localSet] = await Promise.all([scan("SourceSet"), scan("LocalReporterSet")]);

      // Sources can be re-registered, and reporters toggled off again; the last log for a
      // given key is the live state, so later entries overwrite earlier ones.
      const crossChain = new Map<Hex, { emitter: Address; topic0: Hex; enabled: boolean }>();
      for (const log of sourceSet) {
        const a = (log as { args: { sourceId: Hex; emitter: Address; topic0: Hex; enabled: boolean } }).args;
        crossChain.set(a.sourceId, { emitter: a.emitter, topic0: a.topic0, enabled: a.enabled });
      }

      const localReporters = new Map<Address, boolean>();
      for (const log of localSet) {
        const a = (log as { args: { reporter: Address; enabled: boolean } }).args;
        localReporters.set(a.reporter, a.enabled);
      }

      return {
        crossChain: [...crossChain.entries()].filter(([, v]) => v.enabled),
        localReporters: [...localReporters.entries()].filter(([, on]) => on).map(([r]) => r),
      };
    },
  });

  const base = {
    address: contracts.creditPassport,
    abi: creditPassportAbi,
    chainId: cc3Testnet.id,
  } as const;

  // localSourceIdFor is pure, but it is asked of the contract rather than reimplemented
  // here: the id is a keccak over a packed encoding, and a mismatch would silently look up
  // stats for a source that does not exist.
  const localReporters = registry?.localReporters ?? [];
  const { data: localIds } = useReadContracts({
    contracts: localReporters.map((r) => ({
      ...base,
      functionName: "localSourceIdFor" as const,
      args: [r] as const,
    })),
    query: { enabled: localReporters.length > 0 },
  });

  const entries: { sourceId: Hex; label: string }[] = [
    ...localReporters.map((r, i) => ({
      sourceId: (localIds?.[i]?.result as Hex | undefined) ?? ("0x" as Hex),
      label: r.toLowerCase() === contracts.passportPool.toLowerCase() ? "PassportPool" : `Local ${shortAddr(r)}`,
    })),
    ...(registry?.crossChain ?? []).map(([id, v]) => ({
      sourceId: id,
      label: KNOWN_TOPICS[v.topic0] ?? `Source ${shortAddr(v.emitter)}`,
    })),
  ].filter((e) => e.sourceId !== "0x");

  const { data: stats, isLoading: isLoadingStats } = useReadContracts({
    contracts:
      address && entries.length > 0
        ? entries.map((e) => ({
            ...base,
            functionName: "sourceStats" as const,
            args: [address, e.sourceId] as const,
          }))
        : undefined,
    query: { enabled: Boolean(address) && entries.length > 0 },
  });

  const sources: PassportSource[] = entries.map((e, i) => {
    const r = stats?.[i]?.result as readonly [number, number] | undefined;
    return { ...e, count: BigInt(r?.[0] ?? 0), lastAt: BigInt(r?.[1] ?? 0) };
  });

  return { sources, isLoading: isScanning || isLoadingStats };
}
