import { Drawer, Modal, Popover, UnstyledButton, VisuallyHidden } from '@mantine/core'
import type { ReactElement, ReactNode } from 'react'
import styles from './OverlaySurface.module.css'
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
    // A dialog with no visible header near the top of the screen on desktop
    // and tablet, and the whole screen with a title and Cancel on mobile.
    | { desktop: 'panel' }
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
// popover anchored to its trigger. A panel instead takes the whole screen on
// mobile and floats near the top elsewhere. Internal: callers pass size to
// ResponsiveDialog/ResponsivePopover/ResponsivePanel and never learn these
// adapters.
export function OverlaySurface(props: OverlaySurfaceProps) {
  if (props.size === 'desktop' && props.desktop === 'anchored') {
    const { opened, onClose, label, children, target, width = 320 } = props
    // Controlled, Mantine's Popover tells Esc and outside clicks to onDismiss;
    // its onClose only follows `opened`.
    return (
      <Popover opened={opened} onDismiss={onClose} width={width} position="bottom-end" withArrow trapFocus returnFocus>
        <Popover.Target>{target}</Popover.Target>
        <Popover.Dropdown aria-label={label}>{children}</Popover.Dropdown>
      </Popover>
    )
  }

  const { size, opened, onClose, label, children } = props

  if (props.desktop === 'panel') {
    return size === 'mobile' ? (
      <Drawer.Root opened={opened} onClose={onClose} position="bottom" size="100%">
        <Drawer.Overlay />
        <Drawer.Content className={styles.fullScreen}>
          <Drawer.Header className={styles.fullScreenHeader}>
            <Drawer.Title className={styles.fullScreenTitle}>{label}</Drawer.Title>
            <UnstyledButton className={styles.cancel} onClick={onClose}>
              Cancel
            </UnstyledButton>
          </Drawer.Header>
          <Drawer.Body className={styles.panelBody}>{children}</Drawer.Body>
        </Drawer.Content>
      </Drawer.Root>
    ) : (
      <Modal.Root opened={opened} onClose={onClose} centered={false} yOffset={size === 'desktop' ? 120 : 150} size={size === 'desktop' ? 640 : 600}>
        <Modal.Overlay />
        <Modal.Content className={styles.panel}>
          <VisuallyHidden>
            <Modal.Title>{label}</Modal.Title>
          </VisuallyHidden>
          <Modal.Body className={styles.panelBody}>{children}</Modal.Body>
        </Modal.Content>
      </Modal.Root>
    )
  }

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
