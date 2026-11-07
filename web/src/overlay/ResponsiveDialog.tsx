import { Button, Drawer, Group, Modal, Stack } from '@mantine/core'
import type { ReactNode } from 'react'
import { useOverlaySize } from './useOverlaySize'

export type ResponsiveDialogProps = {
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
  const size = useOverlaySize()

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

  if (size === 'mobile') {
    return (
      <Drawer opened={opened} onClose={onClose} title={title} position="bottom">
        {body}
      </Drawer>
    )
  }

  return (
    <Modal opened={opened} onClose={onClose} title={title}>
      {body}
    </Modal>
  )
}
