import { Drawer, Modal, Popover } from '@mantine/core'
import type { ReactElement, ReactNode } from 'react'
import type { OverlaySize } from './useOverlaySize'

type CommonProps = {
  size: OverlaySize
  opened: boolean
  onClose: () => void
  /** The accessible name, and the visible heading on tablet and mobile. */
  label: string
  children: ReactNode
}

type OverlaySurfaceProps = CommonProps &
  (
    | { desktop: 'dialog' }
    | {
        desktop: 'anchored'
        /** The trigger; kept outside the dialog/sheet so it can receive focus back when closed. */
        target: ReactElement
        /** Desktop popover width in px. @default 320 */
        width?: number
      }
  )

// The one place an OverlaySize becomes a shape. A bottom sheet on mobile, a
// centred dialog on tablet, and on desktop either that same dialog or a
// popover anchored to its trigger. Internal: callers pass size to
// ResponsiveDialog/ResponsivePopover and never learn these adapters.
export function OverlaySurface(props: OverlaySurfaceProps) {
  if (props.size === 'desktop' && props.desktop === 'anchored') {
    const { opened, onClose, label, children, target, width = 320 } = props
    return (
      <Popover opened={opened} onClose={onClose} width={width} position="bottom-end" withArrow trapFocus returnFocus>
        <Popover.Target>{target}</Popover.Target>
        <Popover.Dropdown aria-label={label}>{children}</Popover.Dropdown>
      </Popover>
    )
  }

  const { size, opened, onClose, label, children } = props
  const panel =
    size === 'mobile' ? (
      <Drawer opened={opened} onClose={onClose} title={label} position="bottom">
        {children}
      </Drawer>
    ) : (
      <Modal opened={opened} onClose={onClose} title={label}>
        {children}
      </Modal>
    )

  // An anchored overlay on tablet/mobile still needs its trigger rendered.
  return props.desktop === 'anchored' ? (
    <>
      {props.target}
      {panel}
    </>
  ) : (
    panel
  )
}
