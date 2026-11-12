import { useEffect, useRef, useState, type MouseEvent, type TouchEvent } from 'react'

/** How long a touch is held before it opens the menu, as the browser's own long-press. */
export const LONG_PRESS_MS = 500
/** A touch that drifts further than this is a scroll, not a long-press. */
const LONG_PRESS_SLOP = 10

type Opened<T> = { x: number; y: number; value: T }

/**
 * A right-click menu: `triggerProps(value)` goes on each element that opens it,
 * by right-click (or the keyboard's menu key) and by long-press on touch, and
 * `opened.value` says which one did. The innermost trigger wins, and the
 * browser's own menu never also shows. Render the items in a `ContextMenu`.
 */
export function useContextMenu<T>() {
  const [opened, setOpened] = useState<Opened<T> | null>(null)
  const press = useRef<{ timer: number; x: number; y: number; fired: boolean } | null>(null)

  const cancel = () => {
    if (press.current) window.clearTimeout(press.current.timer)
  }
  useEffect(() => cancel, [])

  const triggerProps = (value: T) => ({
    onContextMenu(event: MouseEvent<HTMLElement>) {
      event.preventDefault()
      event.stopPropagation()
      // From the keyboard there is no pointer, so open at the element.
      if (event.clientX === 0 && event.clientY === 0) {
        const box = event.currentTarget.getBoundingClientRect()
        setOpened({ x: box.left + 12, y: box.top + box.height / 2, value })
      } else {
        setOpened({ x: event.clientX, y: event.clientY, value })
      }
    },
    onTouchStart(event: TouchEvent<HTMLElement>) {
      event.stopPropagation()
      cancel()
      if (event.touches.length !== 1) return
      const { clientX: x, clientY: y } = event.touches[0]
      const timer = window.setTimeout(() => {
        if (press.current) press.current.fired = true
        setOpened({ x, y, value })
      }, LONG_PRESS_MS)
      press.current = { timer, x, y, fired: false }
    },
    onTouchMove(event: TouchEvent<HTMLElement>) {
      const touch = event.touches[0]
      if (press.current && touch && Math.hypot(touch.clientX - press.current.x, touch.clientY - press.current.y) > LONG_PRESS_SLOP) {
        cancel()
      }
    },
    onTouchEnd(event: TouchEvent<HTMLElement>) {
      cancel()
      // The finger lifting after a long-press isn't a tap: no click follows.
      if (press.current?.fired) event.preventDefault()
      press.current = null
    },
    onTouchCancel() {
      cancel()
      press.current = null
    },
  })

  return { opened, close: () => setOpened(null), triggerProps }
}
