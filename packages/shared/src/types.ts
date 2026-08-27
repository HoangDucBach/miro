export interface StreamCreatedEvent {
  streamId: bigint;
  borrower: string; // recipient / Sablier Lockup NFT holder
  token: string; // vested ERC-20, whatever the grantor funded the stream with
  depositAmount: bigint;
  startTime: bigint;
  endTime: bigint;
  cancelable: boolean;
  transferable: boolean;
}

export interface StreamWithdrawnEvent {
  streamId: bigint;
  to: string; // withdrawal destination -- not necessarily the borrower identity itself
  token: string;
  amount: bigint;
}

// CancelLockupStream is intentionally not modeled here: only non-cancelable streams are
// ever accepted as collateral (see StreamVerifierASC.sol), so a legitimate cancel can
// never target a stream Miro is tracking.
export type StreamEvent =
  | { kind: "created"; data: StreamCreatedEvent }
  | { kind: "withdrawn"; data: StreamWithdrawnEvent };

// NOTE: chain info comes directly from @gluwa/usc-sdk's chainInfo.ChainInfo type
// (apps/worker/src/lib/chain.ts) — not duplicated here, to avoid drifting from the real SDK shape.
// NOTE: job/queue state lives in BullMQ (apps/worker/src/lib/queue.ts) now, not a custom type here.
