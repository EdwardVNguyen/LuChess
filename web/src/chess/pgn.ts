import { START_FEN, type Result } from './chess.ts'
import { moveOf, type MoveId, type MoveTree, type TreeMove } from './tree.ts'

// Reading and writing PGN with Variations (ADR 0009). @mliebelt/pgn-parser
// reads the text, and every move is checked by chess.js as it joins the tree.
// An import keeps everything it can: Variations, NAGs as Glyphs, the first
// {comment} after a move as its Comment and any later ones as its Body, a
// comment before the first move as the Position's Body, and [%cal]/[%csl] as
// Drawings. Export reverses this, so our own PGNs round-trip.
//
// The parser is large and only importing needs it, so it lives in
// pgnImport.ts and the app reaches it only through loadPgnImport(), which
// loads it as its own chunk. Everything here loads without it.

/** Reads a PGN into a tree of Moves with their writing, or says why it can't. */
export type PgnImport = (pgn: string) => Result<ImportedNote>

let loading: Promise<PgnImport> | null = null

/**
 * Loads the PGN reader. Every call shares one load; after a failed one
 * (offline, say) the next call tries again.
 */
export function loadPgnImport(): Promise<PgnImport> {
  loading ??= import('./pgnImport.ts').then(
    (module) => module.importPgn,
    (error: unknown) => {
      loading = null
      throw error
    },
  )
  return loading
}

/** A Note's PGN may be at most this long, in bytes, and hold at most MAX_MOVES Moves. */
export const MAX_PGN_BYTES = 64 * 1024
export const MAX_MOVES = 5_000

export type Brush = 'green' | 'red' | 'blue' | 'yellow'

/** An arrow, or a circle when `to` is absent. */
export type Drawing = { from: string; to?: string; brush: Brush }

/** Everything written on a Move or the Position. A field is null, or the list empty, when there is none. */
export type Writing = {
  comment: string | null
  body: string | null
  moveGlyph: string | null
  positionGlyph: string | null
  drawings: Drawing[]
}

export const NO_WRITING: Writing = { comment: null, body: null, moveGlyph: null, positionGlyph: null, drawings: [] }

export function hasWriting(writing: Writing | undefined): boolean {
  return Boolean(
    writing &&
      (writing.comment || writing.body || writing.moveGlyph || writing.positionGlyph || writing.drawings.length > 0),
  )
}

/** A PGN tag pair, e.g. ["White", "Fischer, Robert James"]. */
export type TagPair = [string, string]

export type ImportedNote = {
  startFen: string
  /** In the order the PGN gives them. */
  tags: TagPair[]
  tree: MoveTree
  /** The writing on each Move that has some, and on the Position (the root). */
  writing: Map<MoveId, Writing>
}

// NAGs that have a Glyph (notes/glyphs.ts). Others are dropped on import.
export const MOVE_NAGS: Record<string, string> = { $1: '!', $2: '?', $3: '!!', $4: '??', $5: '!?', $6: '?!' }
export const POSITION_NAGS: Record<string, string> = {
  $10: '=',
  $11: '=',
  $12: '=',
  $13: '∞',
  $14: '⩲',
  $15: '⩱',
  $16: '±',
  $17: '∓',
  $18: '+−',
  $19: '−+',
}
export const NAG_OF: Record<string, string> = {
  '!': '$1',
  '?': '$2',
  '!!': '$3',
  '??': '$4',
  '!?': '$5',
  '?!': '$6',
  '=': '$10',
  '∞': '$13',
  '⩲': '$14',
  '⩱': '$15',
  '±': '$16',
  '∓': '$17',
  '+−': '$18',
  '−+': '$19',
}

export const BRUSH_OF: Record<string, Brush> = { G: 'green', R: 'red', B: 'blue', Y: 'yellow' }
const LETTER_OF: Record<Brush, string> = { green: 'G', red: 'R', blue: 'B', yellow: 'Y' }

// The parser joins a move's comments into one; this marks where each began.
export const SEPARATOR = '\u001e'

type ExportInput = {
  tree: MoveTree
  tags: readonly TagPair[]
  writing: ReadonlyMap<MoveId, Writing>
  /** How a Link reads outside the app: its label, else its target's name; null when the target is unknown. */
  linkName: (target: number) => string | null
}

/**
 * The PGN for a Note: its tags, then each Move as `SAN $NAG {Comment} {Body}`
 * with its Drawings as [%csl]/[%cal] in the first comment, and Variations in
 * parentheses after the Move they replace. Links are written as plain text.
 */
export function exportPgn({ tree, tags, writing, linkName }: ExportInput): string {
  const header = [...tags]
  if (tree.startFen !== START_FEN && !header.some(([name]) => name === 'FEN')) {
    header.push(['SetUp', '1'], ['FEN', tree.startFen])
  }
  const result = header.find(([name]) => name === 'Result')?.[1] ?? '*'
  const text = (comment: string) => plainText(comment, linkName)

  const tokens: string[] = [...comments(writing.get(tree.root), true, text)]

  function moveTokens(move: TreeMove, numbered: boolean): string[] {
    const number = move.color === 'w' ? `${move.moveNumber}.` : numbered ? `${move.moveNumber}...` : null
    const written = writing.get(move.id)
    const nags = [written?.moveGlyph, written?.positionGlyph].flatMap((glyph) => (glyph && NAG_OF[glyph] ? [NAG_OF[glyph]] : []))
    return [...(number ? [number] : []), move.san ?? '', ...nags, ...comments(written, false, text)]
  }

  function line(from: TreeMove, numbered: boolean): string[] {
    const out: string[] = []
    let at = from
    let number = numbered
    while (at.children.length > 0) {
      const [main, ...variations] = at.children.map((id) => moveOf(tree, id))
      out.push(...moveTokens(main, number))
      number = hasText(writing.get(main.id))
      for (const variation of variations) {
        const inner = [...moveTokens(variation, true), ...line(variation, hasText(writing.get(variation.id)))]
        inner[0] = `(${inner[0]}`
        inner[inner.length - 1] = `${inner[inner.length - 1]})`
        out.push(...inner)
        number = true
      }
      at = main
    }
    return out
  }

  tokens.push(...line(moveOf(tree, tree.root), true), result)
  const head = header.map(([name, value]) => `[${name} "${value.replace(/[\\"]/g, '\\$&')}"]`).join('\n')
  return `${head}${head ? '\n\n' : ''}${wrap(tokens)}\n`
}

function hasText(writing: Writing | undefined): boolean {
  return Boolean(writing && (writing.comment || writing.body || writing.drawings.length > 0))
}

/** The comments for a Move's writing: {Comment} {Body}, the Drawings in the first. */
function comments(writing: Writing | undefined, atRoot: boolean, text: (comment: string) => string): string[] {
  if (!writing) return []
  const diag = [
    commands('csl', writing.drawings.filter((d) => !d.to)),
    commands('cal', writing.drawings.filter((d) => d.to)),
  ].join('')
  const comment = [diag, writing.comment ? text(writing.comment) : ''].filter(Boolean).join(' ')
  const body = writing.body ? text(writing.body) : ''
  // A lone comment at the root reads back as the Body, so a Comment there needs a second.
  if (atRoot && !writing.comment && body) return [`{${[diag, body].filter(Boolean).join(' ')}}`]
  if (body) return [`{${comment}}`, `{${body}}`]
  if (comment) return atRoot && writing.comment ? [`{${comment}}`, '{}'] : [`{${comment}}`]
  return []
}

function commands(name: 'csl' | 'cal', drawings: readonly Drawing[]): string {
  if (drawings.length === 0) return ''
  return `[%${name} ${drawings.map((d) => `${LETTER_OF[d.brush]}${d.from}${d.to ?? ''}`).join(',')}]`
}

const LINK = /\[\[note:([1-9]\d{0,14})(?:\|([^\]\n]*))?\]\]/g

/** A Comment or Body as PGN comment text: Links as their label or target's name, and no braces. */
function plainText(text: string, linkName: (target: number) => string | null): string {
  return text
    .replace(LINK, (_, target: string, label: string | undefined) => label?.trim() || linkName(Number(target)) || 'a deleted note')
    .replaceAll('{', '(')
    .replaceAll('}', ')')
    .replaceAll(SEPARATOR, ' ')
}

/** Joins tokens into lines of about 80 characters, as PGN export usually is. */
function wrap(tokens: readonly string[]): string {
  let text = ''
  // The length of the last line so far; a comment may hold line breaks of its own.
  let width = 0
  for (const token of tokens) {
    const first = token.split('\n')[0].length
    if (text && width + 1 + first > 80) {
      text += '\n'
      width = 0
    } else if (text) {
      text += ' '
      width += 1
    }
    text += token
    const lastBreak = token.lastIndexOf('\n')
    width = lastBreak === -1 ? width + token.length : token.length - lastBreak - 1
  }
  return text
}

/** The tags as a record for showing them, without unknown "?" values; the first of a name wins. */
export function tagRecord(tags: readonly TagPair[]): Record<string, string> {
  const record: Record<string, string> = {}
  for (const [name, value] of tags) {
    if (!(name in record) && value && !/^[?.*\s]*$/.test(value)) record[name] = value
  }
  return record
}
