import { Button, Checkbox, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { useId, useState, type ReactNode } from 'react'
import { Board } from '../board'
import type { Orientation } from '../board/BoardSurface'
import {
  castlingAllowed,
  placementFromFen,
  validateFen,
  withCastling,
  type CastlingRight,
} from '../chess/chess'
import { ConfirmDialog, useOverlaySize } from '../overlay'
import { EMPTY_BOARD_FEN, startFenFor } from './positionSetup'
import styles from './Notes.module.css'

const CASTLING_LABELS: { right: CastlingRight; label: string }[] = [
  { right: 'K', label: 'White O-O' },
  { right: 'Q', label: 'White O-O-O' },
  { right: 'k', label: 'Black O-O' },
  { right: 'q', label: 'Black O-O-O' },
]

type Props = {
  /** The Note's name, under the title. */
  name: string
  /** Save was pressed on a legal position; null is the standard start. */
  onSave: (startFen: string | null) => void
  onCancel: () => void
  saving?: boolean
  /** Why the last save failed. */
  error?: string | null
  /**
   * Set while Save waits for the user to confirm the reset: what it deletes,
   * "This deletes its 14 Moves and all its writing.", and what stays.
   */
  confirming?: { loss: string; keeps: string } | null
  onConfirm?: () => void
  onDismiss?: () => void
}

// Edit position (#108) has no design: a page in the house style, like
// starting a Note. It opens on an empty board every time. Saving gives the
// Note this Position, which resets it (docs/adr/0010), so the page that holds
// it asks first when the Note has anything to lose. Shared by a saved Note's
// page and a Guest's Note.
export function EditPosition({
  name,
  onSave,
  onCancel,
  saving = false,
  error = null,
  confirming = null,
  onConfirm,
  onDismiss,
}: Props) {
  // The position as the setup board gives it, with every castling right its placement allows.
  const [placed, setPlaced] = useState(EMPTY_BOARD_FEN)
  // The rights the user took away: a king and rook at home may have lost them.
  const [revoked, setRevoked] = useState<ReadonlySet<CastlingRight>>(new Set())
  const [orientation, setOrientation] = useState<Orientation>('white')
  const size = useOverlaySize()
  const castlingId = useId()

  const allowed = castlingAllowed(placementFromFen(placed))
  const fen = withCastling(
    placed,
    allowed.filter((right) => !revoked.has(right)),
  )
  const legal = validateFen(fen).ok

  function toggle(right: CastlingRight, on: boolean) {
    setRevoked((current) => {
      const next = new Set(current)
      if (on) next.delete(right)
      else next.add(right)
      return next
    })
  }

  return (
    <div className={styles.newNote}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          if (legal) onSave(startFenFor(fen))
        }}
      >
        <Stack gap="lg">
          <div>
            <Title order={1}>Edit position</Title>
            <Text c="var(--cn-muted)" mt={4}>
              {name}
            </Text>
          </div>
          <Text size="sm">
            Set up the pieces for this note to start from. Saving starts the note again from this position, deleting its
            moves and everything written on it.
          </Text>

          <Stack gap="md" className={styles.newBoard}>
            <Board mode="setup" fen={fen} orientation={orientation} onFenChange={(next) => setPlaced(next)} />
            <div role="group" aria-labelledby={castlingId}>
              <Text id={castlingId} size="sm" fw={500}>
                Castling
              </Text>
              <SimpleGrid cols={2} spacing="md" verticalSpacing="xs" mt={6}>
                {CASTLING_LABELS.map(({ right, label }) => (
                  <Checkbox
                    key={right}
                    label={label}
                    checked={allowed.includes(right) && !revoked.has(right)}
                    disabled={!allowed.includes(right)}
                    onChange={(event) => toggle(right, event.currentTarget.checked)}
                  />
                ))}
              </SimpleGrid>
            </div>
            <Group>
              <Button
                variant="default"
                size="xs"
                onClick={() => setOrientation((current) => (current === 'white' ? 'black' : 'white'))}
              >
                Flip board
              </Button>
            </Group>
          </Stack>

          {error && !confirming && (
            <Text c="accent" size="sm" role="alert">
              {error}
            </Text>
          )}

          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={!legal} loading={saving && !confirming}>
              Save
            </Button>
          </Group>
        </Stack>
      </form>
      <ConfirmDialog
        size={size}
        opened={confirming !== null}
        onClose={() => onDismiss?.()}
        title="Replace this note's position?"
        message={confirmMessage(confirming, confirming && error)}
        confirmLabel="Replace position"
        onConfirm={() => onConfirm?.()}
        confirmLoading={saving}
        destructive
      />
    </div>
  )
}

function confirmMessage(confirming: Props['confirming'], error: string | null | undefined): ReactNode {
  if (!confirming) return null
  return (
    <>
      {confirming.loss} {confirming.keeps}
      {error && (
        <Text component="span" display="block" c="accent" size="sm" mt="sm" role="alert">
          {error}
        </Text>
      )}
    </>
  )
}
