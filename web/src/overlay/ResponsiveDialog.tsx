import { Button, Group, Stack } from '@mantine/core'
import type { ReactNode } from 'react'
import { OverlaySurface } from './OverlaySurface'
import type { OverlaySize } from './useOverlaySize'

export type ResponsiveDialogProps = {
  /** Supplied by the composition point, usually from useOverlaySize(). */
  size: OverlaySize
  opened: boolean
  onClose: () => void
  /** Shown as the dialog's heading, and read by screen readers as its name. */
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  cancelLabel?: string
  /** Styles the primary button with the oxblood accent, for actions that delete or discard. */
  destructive?: boolean
  confirmDisabled?: boolean
  confirmLoading?: boolean
}

// A centred dialog on desktop and tablet, a bottom sheet on mobile, with a
// title, a body and an actions row (NewFolder.png, NewFolder-tablet.png,
// NewFolder-mobile.png). Built on Mantine Modal and Drawer, which already
// trap focus, close on Esc and return focus to the trigger (web/AGENTS.md,
// theme defaults in web/src/theme/theme.ts).
export function ResponsiveDialog({
  size,
  opened,
  onClose,
  title,
  children,
  confirmLabel,
  onConfirm,
  cancelLabel = 'Cancel',
  destructive = false,
  confirmDisabled = false,
  confirmLoading = false,
}: ResponsiveDialogProps) {
  const body = (
    <Stack gap="lg">
      {children}
      <Group justify="flex-end" gap="xs">
        <Button variant="subtle" onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button
          color={destructive ? 'accent.6' : undefined}
          onClick={onConfirm}
          disabled={confirmDisabled}
          loading={confirmLoading}
        >
          {confirmLabel}
        </Button>
      </Group>
    </Stack>
  )

  return (
    <OverlaySurface size={size} opened={opened} onClose={onClose} label={title} desktop="dialog">
      {body}
    </OverlaySurface>
  )
}
