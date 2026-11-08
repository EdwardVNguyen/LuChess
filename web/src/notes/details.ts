// The details line under a Note's title, built from its PGN tags when they
// are present (ADR 0001: no fields of its own). Round and Date are left out
// to keep it to one or two short lines, as in design/screens/Note.dc.html.
export function noteDetails(tags: Record<string, string>): string | null {
  const parts = [tags.Event, tags.Site, tags.Opening].filter((part): part is string => Boolean(part))
  return parts.length > 0 ? parts.join(' · ') : null
}

/** A name for a pasted game, e.g. "Morphy v. Duke of Brunswick 1858", or null when the tags don't say. */
export function suggestedName(tags: Record<string, string>): string | null {
  const surname = (player: string) => player.split(',')[0].trim()
  const year = /^\d{4}/.exec(tags.Date ?? '')?.[0]
  if (tags.White && tags.Black) {
    return [`${surname(tags.White)} v. ${surname(tags.Black)}`, year].filter(Boolean).join(' ')
  }
  return tags.Event ?? tags.Opening ?? null
}
