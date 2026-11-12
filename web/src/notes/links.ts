// Links in a Comment or Body (ADR 0002): the text holds [[note:42]] or
// [[note:42|label]], and the name shown is looked up when rendering. The API
// reads the same tokens (api/handlers/links.go): a label runs to the closing
// brackets with no "]" or line break, and IDs stop at 15 digits.
const TOKEN = /\[\[note:([1-9]\d{0,14})(?:\|([^\]\n]*))?\]\]/g

export type TextPart = { kind: 'text'; text: string } | { kind: 'link'; target: number; label: string | null }

/** Splits text into plain runs and Links. A blank label is no label. */
export function parseLinks(text: string): TextPart[] {
  const parts: TextPart[] = []
  let last = 0
  for (const match of text.matchAll(TOKEN)) {
    if (match.index > last) parts.push({ kind: 'text', text: text.slice(last, match.index) })
    const label = match[2]?.trim()
    parts.push({ kind: 'link', target: Number(match[1]), label: label ? label : null })
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) })
  return parts
}

/** The Notes a text links to, each once, in order of first appearance. */
export function linkTargets(text: string): number[] {
  const ids: number[] = []
  for (const part of parseLinks(text)) if (part.kind === 'link' && !ids.includes(part.target)) ids.push(part.target)
  return ids
}

/**
 * The Notes a Note's writing links to, each once, in the order given (reading
 * order, the Comment before the Body), with the first label it was given, to
 * tell apart Links whose targets are gone.
 */
export function connections(
  writing: readonly { comment: string | null; body: string | null }[],
): { target: number; label: string | null }[] {
  const found: { target: number; label: string | null }[] = []
  const text = writing.flatMap((w) => [w.comment ?? '', w.body ?? ''])
  for (const part of parseLinks(text.join('\n'))) {
    if (part.kind !== 'link') continue
    const seen = found.find((c) => c.target === part.target)
    if (!seen) found.push({ target: part.target, label: part.label })
    else seen.label ??= part.label
  }
  return found
}

/** The token for a Link; characters a label cannot hold become spaces. */
export function linkToken(target: number, label?: string | null): string {
  const clean = (label ?? '').replace(/[\]\n\r]+/g, ' ').trim()
  return clean ? `[[note:${target}|${clean}]]` : `[[note:${target}]]`
}

/** Where a Link's target stands: its current name, deleted, or not known yet (loading, or a Guest). */
export type LinkStatus = { status: 'resolved'; name: string } | { status: 'unresolved' } | { status: 'unknown' }

/** A run of text as shown: plain, or a Link showing its label or its target's name. */
export type ShownPart = { text: string; link: null } | { text: string; link: { target: number; status: LinkStatus['status'] } }

export const DELETED_NOTE = 'Deleted note'

export function showLinks(parts: readonly TextPart[], resolve: (target: number) => LinkStatus): ShownPart[] {
  return parts.map((part) => {
    if (part.kind === 'text') return { text: part.text, link: null }
    const found = resolve(part.target)
    const name = found.status === 'resolved' ? found.name : found.status === 'unresolved' ? DELETED_NOTE : 'Linked note'
    return { text: part.label ?? name, link: { target: part.target, status: found.status } }
  })
}

export function shownLength(parts: readonly ShownPart[]): number {
  return parts.reduce((total, part) => total + part.text.length, 0)
}

/**
 * The start of shown text, cut near `max` characters at a word and marked with
 * an ellipsis. A Link is kept whole or left out, never cut through.
 */
export function cutShown(parts: readonly ShownPart[], max: number): ShownPart[] {
  const kept: ShownPart[] = []
  let used = 0
  for (const part of parts) {
    if (used + part.text.length <= max) {
      kept.push(part)
      used += part.text.length
      continue
    }
    if (part.link === null) {
      const room = part.text.slice(0, max - used)
      // At the last word break; a single long word with nothing before it is cut anywhere.
      const space = room.lastIndexOf(' ')
      const cut = space > 0 ? room.slice(0, space) : used === 0 ? room : ''
      if (cut) kept.push({ text: cut, link: null })
    }
    break
  }
  const last = kept.at(-1)
  if (last && last.link === null) kept[kept.length - 1] = { text: last.text.trimEnd(), link: null }
  kept.push({ text: '…', link: null })
  return kept
}

/**
 * The move a Ply names, as "10." for White or "10…" for Black, from the
 * Note's starting Position (null for the standard start). Ply 0 is the Position.
 */
export function moveNumberAt(startFen: string | null, ply: number): string | null {
  if (ply < 1) return null
  const fields = (startFen ?? '').split(' ')
  const blackStarts = fields[1] === 'b'
  const first = Number.parseInt(fields[5] ?? '', 10)
  const start = Number.isFinite(first) && first > 0 ? first : 1
  const after = ply - 1 + (blackStarts ? 1 : 0)
  const number = start + Math.floor(after / 2)
  return after % 2 === 0 ? `${number}.` : `${number}…`
}

/** Where a Backlink sits in the linking Note, e.g. "Comment on 10…exd5", in a Main line or a Variation. */
export function backlinkPlace({
  part,
  ply,
  san,
  startFen,
}: {
  part: 'comment' | 'body'
  ply: number
  san: string | null
  startFen: string | null
}) {
  const number = moveNumberAt(startFen, ply)
  if (number === null || san === null) return part === 'comment' ? 'Comment on the position' : 'Body opening the note'
  return part === 'comment' ? `Comment on ${number}${san}` : `Body after ${number}${san}`
}
