import type { ReactElement, ReactNode } from 'react'
import { OverlaySurface } from './OverlaySurface'
import type { OverlaySize } from './useOverlaySize'

export type ResponsivePopoverProps = {
  /** Supplied by the composition point, usually from useOverlaySize(). */
  size: OverlaySize
  opened: boolean
  onClose: () => void
  /** The trigger; kept outside the popover/dialog/sheet so it can receive focus back when closed. */
  target: ReactElement
  /** Not shown on desktop (the popover has no header), but used as its accessible name, and as the visible title on tablet/mobile. */
  label: string
  children: ReactNode
  /** Desktop popover width in px. @default 320 */
  width?: number
}

// Anchored to its trigger on desktop, a centred dialog on tablet, a bottom
// sheet on mobile (ArticleSave.png, ArticleSave-tablet.png,
// ArticleSave-mobile.png; PlayCustomTime-mobile.png). Built on Mantine
// Popover, Modal and Drawer, which already trap focus, close on Esc and
// return focus to the trigger (web/src/theme/theme.ts has the shared styles).
export function ResponsivePopover({ size, opened, onClose, target, label, children, width = 320 }: ResponsivePopoverProps) {
  return (
    <OverlaySurface size={size} opened={opened} onClose={onClose} label={label} target={target} width={width} desktop="anchored">
      {children}
    </OverlaySurface>
  )
}
