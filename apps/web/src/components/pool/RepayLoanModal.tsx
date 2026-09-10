"use client";

import { Button, Modal, Spinner, useOverlayState } from "@heroui/react";
import { useEffect, useState } from "react";
import { useChainId, useSwitchChain } from "wagmi";
import { ProtocolIcon } from "@/components/ui/ProtocolIcon";
import type { RepayTerms } from "@/hooks/useCrossChainLoans";
import { sepolia } from "@/lib/chains";
import { errorText } from "@/lib/errors";
import { formatToken } from "@/lib/format";

interface RepayLoanModalProps {
  protocol: string;
  terms: RepayTerms;
  onConfirm: () => Promise<unknown>;
  isPending: boolean;
  isConfirmed: boolean;
  error: Error | null;
}

/**
 * Confirms closing a loan on a source protocol from inside Miro, rather than sending the
 * borrower off to Aave's or Morpho's own app.
 *
 * There is no amount field: both protocols are repaid in full here -- Aave by its
 * repay-everything sentinel, Morpho by burning the exact share balance -- because a
 * partial repayment leaves dust debt that reads as an open position, and because the
 * passport only scores a repayment above its anti-dust floor anyway.
 *
 * The wallet has to be on Sepolia to sign, so a mismatch is a switch prompt here instead
 * of a revert later.
 */
export function RepayLoanModal({
  protocol,
  terms,
  onConfirm,
  isPending,
  isConfirmed,
  error,
}: RepayLoanModalProps) {
  const modal = useOverlayState();
  const { close, open } = modal;
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching, error: switchError } = useSwitchChain();

  // isConfirmed tracks a receipt and stays true for that hash's lifetime, so on its own it
  // would greet a freshly reopened dialog as already done.
  const [submittedHere, setSubmittedHere] = useState(false);
  const confirmedHere = isConfirmed && submittedHere;

  useEffect(() => {
    if (confirmedHere) close();
  }, [confirmedHere, close]);

  const onSepolia = chainId === sepolia.id;
  const short = terms.balance < terms.amount;
  const message = errorText(error) ?? errorText(switchError);

  return (
    <>
      <Button
        variant="outline"
        onPress={() => {
          setSubmittedHere(false);
          open();
        }}
      >
        Repay
      </Button>

      <Modal.Backdrop isOpen={modal.isOpen} onOpenChange={modal.setOpen}>
        <Modal.Container>
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading className="flex items-center gap-2">
                <ProtocolIcon name={protocol} />
                Repay {protocol}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              <div className="border-default flex flex-col gap-3 rounded-xl border border-solid p-4">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-muted text-sm">Repaying</span>
                  <span className="text-lg font-medium tabular-nums">
                    {formatToken(terms.amount, terms.decimals)} {terms.symbol}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-muted text-sm">In wallet</span>
                  <span className="text-muted text-sm tabular-nums">
                    {formatToken(terms.balance, terms.decimals)} {terms.symbol}
                  </span>
                </div>
              </div>

              {short ? (
                <p className={`text-sm ${terms.canTopUp ? "text-muted" : "text-danger"}`}>
                  {terms.canTopUp
                    ? `Interest has accrued past the balance, so the testnet faucet tops up the difference first. Expect three signatures: faucet, approve, repay.`
                    : `Not enough ${terms.symbol} to close this position, and this token has no public faucet.`}
                </p>
              ) : (
                <p className="text-muted text-sm">
                  Two signatures: an ERC-20 approval, then the repayment itself.
                </p>
              )}

              {message ? <p className="text-danger text-sm">{message}</p> : null}

              {onSepolia ? (
                <Button
                  isDisabled={short && !terms.canTopUp}
                  isPending={isPending}
                  onPress={async () => {
                    setSubmittedHere(true);
                    try {
                      await onConfirm();
                    } catch {
                      // Rejection and revert both surface through `error` above; swallowing
                      // keeps a declined signature from becoming an unhandled rejection.
                    }
                  }}
                >
                  {isPending ? <Spinner color="current" size="sm" /> : null}
                  {isPending ? "Submitting…" : "Repay in full"}
                </Button>
              ) : (
                <Button
                  isPending={isSwitching}
                  onPress={() => switchChain({ chainId: sepolia.id })}
                >
                  {isSwitching ? <Spinner color="current" size="sm" /> : null}
                  Switch to Sepolia
                </Button>
              )}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}
