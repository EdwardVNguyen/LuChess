import { useEffect, useRef, useState } from 'react'

/** A row of the Folder tree whose name is being edited in place. */
export type RenameTarget = { kind: 'note' | 'folder'; id: number }

/** How a rename ended: by the keyboard (Enter or Escape), which keeps focus on the row, or by leaving the field. */
export type RenameEnd = 'keyboard' | 'blur'

/** A row's key in the Folder tree, set as its `data-row`, e.g. to say which one a menu is open on. */
export const rowKey = (target: RenameTarget) => `${target.kind}-${target.id}`

/**
 * Which row of the Folder tree is being renamed in place (#99, #100), if any.
 * One at a time: starting another ends the first without saving it. A rename
 * ended from the keyboard puts focus back on its row, found by `data-row`.
 */
export function useInlineRename() {
  const [renaming, setRenaming] = useState<RenameTarget | null>(null)
  const refocus = useRef<string | null>(null)

  useEffect(() => {
    if (refocus.current === null || renaming !== null) return
    document.querySelector<HTMLElement>(`[data-row="${refocus.current}"]`)?.focus()
    refocus.current = null
  })

  return {
    renaming,
    start: (target: RenameTarget) => setRenaming(target),
    end: (how: RenameEnd) => {
      if (how === 'keyboard' && renaming) refocus.current = rowKey(renaming)
      setRenaming(null)
    },
    isRenaming: (kind: RenameTarget['kind'], id: number) => renaming?.kind === kind && renaming.id === id,
  }
}
