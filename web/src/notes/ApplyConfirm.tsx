import { useState } from 'react'
import { ConfirmDialog, type OverlaySize } from '../overlay'

/**
 * What applying the FEN or PGN under the board would lose (#109), to confirm:
 * - `fen`: a FEN starts the Note again from its position, a reset;
 * - `position`: a PGN with a new Position, a reset too;
 * - `pgn`: a PGN matched to the Note, deleting or replacing some of it.
 */
export type ApplyConfirmation = { kind: 'fen' | 'position' | 'pgn'; loss: string }

const COPY = {
  fen: { title: 'Start the note from this position?', confirmLabel: 'Start from here' },
  position: { title: "Replace this note's position?", confirmLabel: 'Replace position' },
  pgn: { title: 'Apply this PGN?', confirmLabel: 'Apply' },
} as const

/**
 * Asks before an apply loses anything; `ask` resolves true once confirmed.
 * `keeps` says what a reset leaves, e.g. "The name and folder stay."
 */
export function useApplyConfirm(size: OverlaySize, keeps: string) {
  const [asking, setAsking] = useState<(ApplyConfirmation & { answer: (yes: boolean) => void }) | null>(null)
  // The last question stays in the dialog while it closes.
  const [shown, setShown] = useState<ApplyConfirmation | null>(null)

  function ask(confirmation: ApplyConfirmation): Promise<boolean> {
    setShown(confirmation)
    return new Promise((answer) => setAsking({ ...confirmation, answer }))
  }

  function answer(yes: boolean) {
    asking?.answer(yes)
    setAsking(null)
  }

  const copy = COPY[shown?.kind ?? 'pgn']
  const message =
    shown?.kind === 'fen'
      ? `The note starts again from the position on the board. ${shown.loss} ${keeps}`
      : shown?.kind === 'position'
        ? `The PGN starts from a different position, so the note starts again from it. ${shown.loss} ${keeps}`
        : `${shown?.loss ?? ''} This cannot be undone.`

  return {
    ask,
    dialog: (
      <ConfirmDialog
        size={size}
        opened={asking !== null}
        onClose={() => answer(false)}
        title={copy.title}
        message={message}
        confirmLabel={copy.confirmLabel}
        onConfirm={() => answer(true)}
        destructive
      />
    ),
  }
}
