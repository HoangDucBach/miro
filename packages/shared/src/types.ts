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

/** Mirrors the worker's persistent job queue states (apps/worker/src/store.ts, §2.4). */
export type ProofJobStatus = "pending" | "attested" | "proven" | "submitted" | "failed";

export interface ProofJob {
  txHash: string;
  eventKind: StreamEvent["kind"];
  blockNumber: number;
  status: ProofJobStatus;
  attempts: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

// NOTE: chain info comes directly from @gluwa/usc-sdk's chainInfo.ChainInfo type
// (apps/worker/src/chain.ts) — not duplicated here, to avoid drifting from the real SDK shape.
