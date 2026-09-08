"use client";

import { Button, Modal, useOverlayState } from "@heroui/react";
import { useEffect } from "react";
import { AmountForm } from "@/components/forms/AmountForm";

interface ActionModalProps {
  /** Button label, and the modal heading. */
  action: string;
  fieldLabel: string;
  decimals: number;
  onSubmit: (amountWei: bigint) => Promise<unknown>;
  isPending: boolean;
  isConfirmed: boolean;
  error: Error | null;
  variant?: "primary" | "outline";
}

/**
 * One of the four pool actions behind a button. The forms themselves are unchanged --
 * AmountForm already owns validation and the pending/confirmed/error states -- this only
 * moves them out of the page and behind a trigger, so the position reads as a summary
 * rather than four permanently open forms.
 */
export function ActionModal({
  action,
  fieldLabel,
  decimals,
  onSubmit,
  isPending,
  isConfirmed,
  error,
  variant = "primary",
}: ActionModalProps) {
  const modal = useOverlayState();
  const { close } = modal;

  // Leaving it open on success would show a confirmed form over a position that has
  // already updated behind it.
  useEffect(() => {
    if (isConfirmed) close();
  }, [isConfirmed, close]);

  return (
    <>
      <Button variant={variant} onPress={modal.open}>
        {action}
      </Button>

      <Modal.Backdrop isOpen={modal.isOpen} onOpenChange={modal.setOpen}>
        <Modal.Container>
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{action}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <AmountForm
                decimals={decimals}
                error={error}
                isConfirmed={isConfirmed}
                isPending={isPending}
                label={fieldLabel}
                onSubmit={onSubmit}
                submitLabel={action}
              />
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}
