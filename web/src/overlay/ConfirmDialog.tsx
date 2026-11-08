import { Text } from '@mantine/core'
import type { ReactNode } from 'react'
import { ResponsiveDialog } from './ResponsiveDialog'
import type { OverlaySize } from './useOverlaySize'

export type ConfirmDialogProps = {
  /** Supplied by the composition point, usually from useOverlaySize(). */
  size: OverlaySize
  opened: boolean
  onClose: () => void
  title: string
  message: ReactNode
  confirmLabel: string
  onConfirm: () => void
  cancelLabel?: string
  /** The oxblood accent, for deleting or discarding (e.g. #10's "this will delete your writing on N moves", #12's delete account). */
  destructive?: boolean
  confirmDisabled?: boolean
  confirmLoading?: boolean
}

// The confirm variant of ResponsiveDialog: a title, a message and a single
// confirm button, nothing else. Used wherever an action needs a yes/no before
// it runs (ADR 0003's destructive-edit warning, account deletion).
export function ConfirmDialog({ message, ...dialogProps }: ConfirmDialogProps) {
  return (
    <ResponsiveDialog {...dialogProps}>
      <Text>{message}</Text>
    </ResponsiveDialog>
  )
}
