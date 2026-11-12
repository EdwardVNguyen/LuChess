import { Menu, Portal } from '@mantine/core'
import type { ReactNode } from 'react'

type Props = {
  /** Where the menu opens, in viewport coordinates; closed when null. */
  at: { x: number; y: number } | null
  onClose: () => void
  /** The `Menu.Item`s. */
  children: ReactNode
}

// The menu useContextMenu opens: a Mantine Menu anchored to the point it was opened at, so
// it looks and works like every other menu on the site.
export function ContextMenu({ at, onClose, children }: Props) {
  if (!at) return null
  return (
    <Portal>
      {/* Remount at each opening, so the menu moves to the new point. */}
      <Menu key={`${at.x},${at.y}`} opened onClose={onClose} position="bottom-start" offset={2} width={200} withinPortal>
        <Menu.Target>
          <span aria-hidden style={{ position: 'fixed', left: at.x, top: at.y, width: 0, height: 0 }} />
        </Menu.Target>
        <Menu.Dropdown>{children}</Menu.Dropdown>
      </Menu>
    </Portal>
  )
}
