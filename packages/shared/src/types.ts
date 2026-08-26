export interface SalaryStreamCreatedEvent {
  streamId: bigint;
  sender: string; // employer
  recipient: string; // borrower
  deposit: bigint;
  ratePerSecond: bigint;
  startTime: bigint;
  stopTime: bigint;
}

export interface SalaryStreamWithdrawnEvent {
  streamId: bigint;
  recipient: string;
  amount: bigint;
}

export interface SalaryStreamCancelledEvent {
  streamId: bigint;
  senderRefund: bigint;
  recipientPayout: bigint;
}

export type StreamEvent =
  | { kind: "created"; data: SalaryStreamCreatedEvent }
  | { kind: "withdrawn"; data: SalaryStreamWithdrawnEvent }
  | { kind: "cancelled"; data: SalaryStreamCancelledEvent };

// NOTE: chain info comes directly from @gluwa/usc-sdk's chainInfo.ChainInfo type
// (apps/worker/src/lib/chain.ts) — not duplicated here, to avoid drifting from the real SDK shape.
// NOTE: job/queue state lives in BullMQ (apps/worker/src/lib/queue.ts) now, not a custom type here.
