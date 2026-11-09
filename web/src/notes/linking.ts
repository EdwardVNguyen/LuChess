import { createContext, useContext, useMemo } from 'react'
import { parseLinks, showLinks, type LinkStatus, type ShownPart } from './links'

/** What the writing needs to know to show and insert Links. */
export type Linking = {
  /** The current name of a Link's target, or that it is gone or not known yet. */
  resolve: (target: number) => LinkStatus
  /** The Note being written on, or null when Links cannot be made (a Guest has no Notes to link to). */
  noteId: number | null
}

// A Guest's writing: no Notes, so nothing resolves and nothing can be linked.
export const LinkingContext = createContext<Linking>({ resolve: () => ({ status: 'unresolved' }), noteId: null })

export function useLinking(): Linking {
  return useContext(LinkingContext)
}

/** A Comment or Body as shown, its Links replaced by their labels or their targets' names. */
export function useShownText(text: string): ShownPart[] {
  const { resolve } = useLinking()
  return useMemo(() => showLinks(parseLinks(text), resolve), [text, resolve])
}
