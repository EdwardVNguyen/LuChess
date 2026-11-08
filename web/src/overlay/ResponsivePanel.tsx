import type { ReactNode } from 'react'
import { OverlaySurface } from './OverlaySurface'
import type { OverlaySize } from './useOverlaySize'

export type ResponsivePanelProps = {
  /** Supplied by the composition point, usually from useOverlaySize(). */
  size: OverlaySize
  opened: boolean
  onClose: () => void
  /** The accessible name everywhere, and the visible title on mobile only. */
  label: string
  /** Laid out by the caller: the panel adds no padding or actions. */
  children: ReactNode
}

// A dialog with no header or actions row, floating near the top on desktop
// and tablet and filling the screen on mobile, with Cancel to close it
// (QuickFind.png, QuickFind-tablet.png, QuickFind-mobile.png). Built on
// Mantine Modal and Drawer, which trap focus, close on Esc and return focus
// to whatever opened it.
export function ResponsivePanel({ size, opened, onClose, label, children }: ResponsivePanelProps) {
  return (
    <OverlaySurface size={size} opened={opened} onClose={onClose} label={label} desktop="panel">
      {children}
    </OverlaySurface>
  )
}
