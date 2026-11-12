import { Text } from '@mantine/core'
import { ConfirmDialog, type OverlaySize } from '../overlay'

type Props = {
  size: OverlaySize
  /** What would go, as the API words it: "This will delete 1 Comment and 1 Glyph". */
  message: string | null
  onClose: () => void
  onConfirm: () => void
  deleting?: boolean
  /** Why the confirmed delete failed. */
  error?: string | null
}

// Delete from here, when writing would go with the Moves (ADR 0003, 0009).
// Open while there is a message.
export function DeleteWritingDialog({ size, message, onClose, onConfirm, deleting = false, error = null }: Props) {
  return (
    <ConfirmDialog
      size={size}
      opened={message !== null}
      onClose={onClose}
      title="Delete your writing?"
      message={
        <>
          {message}: everything written from this move on, in every Variation after it, and the Links in them. This
          cannot be undone.
          {error && (
            <Text component="span" display="block" c="accent" size="sm" mt="sm" role="alert">
              {error}
            </Text>
          )}
        </>
      }
      confirmLabel="Delete"
      onConfirm={onConfirm}
      confirmLoading={deleting}
      destructive
    />
  )
}
