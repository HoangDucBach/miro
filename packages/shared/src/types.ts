/** A proven repayment event from one of the passport's registered sources -- either a
 *  cross-chain attested one (Aave, Morpho) or a same-chain local reporter (PassportPool). */
export interface AttestedRepayEvent {
  sourceId: string; // CreditPassport.sourceIdFor(chainKey, emitter, topic0), or localSourceIdFor(reporter)
  borrower: string;
  amount: bigint;
  chainKey: number;
}

// NOTE: chain info comes directly from @gluwa/usc-sdk's chainInfo.ChainInfo type
// (apps/worker/src/lib/chain.ts) — not duplicated here, to avoid drifting from the real SDK shape.
// NOTE: job/queue state lives in BullMQ (apps/worker/src/lib/queue.ts), not a custom type here.
