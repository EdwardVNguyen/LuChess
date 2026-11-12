import { parse } from '@mliebelt/pgn-parser'
import { validateFen as chessJsValidateFen } from 'chess.js'
import { START_FEN, type Result } from './chess.ts'
import { addMove, moveCount, moveOf, newTree, type MoveId, type MoveTree, type TreeMove } from './tree.ts'

// Reading and writing PGN with Variations (ADR 0009). @mliebelt/pgn-parser
// reads the text, and every move is checked by chess.js as it joins the tree.
// An import keeps everything it can: Variations, NAGs as Glyphs, the first
// {comment} after a move as its Comment and any later ones as its Body, a
// comment before the first move as the Position's Body, and [%cal]/[%csl] as
// Drawings. Export reverses this, so our own PGNs round-trip.

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
const MOVE_NAGS: Record<string, string> = { $1: '!', $2: '?', $3: '!!', $4: '??', $5: '!?', $6: '?!' }
const POSITION_NAGS: Record<string, string> = {
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
const NAG_OF: Record<string, string> = {
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

const BRUSH_OF: Record<string, Brush> = { G: 'green', R: 'red', B: 'blue', Y: 'yellow' }
const LETTER_OF: Record<Brush, string> = { green: 'G', red: 'R', blue: 'B', yellow: 'Y' }

// The parser joins a move's comments into one; this marks where each began.
const SEPARATOR = '\u001e'

/** Reads a PGN into a tree of Moves with their writing, or says why it can't. */
export function importPgn(pgn: string): Result<ImportedNote> {
  if (pgn.trim() === '') return { ok: false, error: 'The PGN is empty.' }
  if (new TextEncoder().encode(pgn).length > MAX_PGN_BYTES) return { ok: false, error: 'The PGN must be at most 64 KB.' }

  const tags = readTags(pgn)
  const fenTag = tags.find(([name]) => name === 'FEN')?.[1]
  const startFen = fenTag?.trim() || START_FEN
  if (fenTag && !chessJsValidateFen(startFen).ok) return { ok: false, error: 'The PGN’s FEN tag is not a legal position.' }

  let game: ParsedGame
  try {
    game = parse(separateComments(pgn), { startRule: 'game' }) as unknown as ParsedGame
  } catch (error) {
    return { ok: false, error: describeParseError(error) }
  }

  let tree = newTree(startFen, 0)
  const writing = new Map<MoveId, Writing>()
  const root = writingOf(game.gameComment?.comment ?? null, null, null, game.gameComment ?? null, true)
  if (hasWriting(root)) writing.set(0, root)

  // Adds a line of moves after `parent`. The Variations given on a move are
  // its alternatives, so they follow its parent, after it.
  function addLine(parent: MoveId, moves: readonly ParsedMove[]): string | null {
    for (const move of moves) {
      if (moveCount(tree) >= MAX_MOVES) return 'A note can hold at most 5,000 moves.'
      const added = addMove(tree, parent, move.notation.notation, tree.moves.size)
      if (!added.ok) return `“${move.notation.notation}” is not a legal move in this game.`
      tree = added.value.tree
      const id = added.value.id
      const written = writingOf(move.commentAfter ?? null, move.commentMove ?? null, move.nag, move.commentDiag, false)
      if (hasWriting(written) && !hasWriting(writing.get(id))) writing.set(id, written)
      for (const variation of move.variations) {
        const failed = addLine(parent, variation)
        if (failed) return failed
      }
      parent = id
    }
    return null
  }

  const failed = addLine(0, game.moves)
  if (failed) return { ok: false, error: failed }
  return { ok: true, value: { startFen, tags, tree, writing } }
}

type ParsedDiag = { colorArrows?: string[]; colorFields?: string[] } | null
type ParsedMove = {
  notation: { notation: string }
  commentMove?: string
  commentAfter?: string
  nag: string[] | null
  commentDiag: ParsedDiag
  variations: ParsedMove[][]
}
type ParsedGame = { gameComment?: ({ comment?: string } & ParsedDiag) | null; moves: ParsedMove[] }

function writingOf(
  after: string | null,
  before: string | null,
  nags: readonly string[] | null,
  diag: ParsedDiag,
  atRoot: boolean,
): Writing {
  const parts = (after ?? '').split(SEPARATOR).map(cleanComment)
  // At the root, a single comment opens the Note as its Body.
  if (atRoot && parts.length === 1) parts.unshift('')
  const [first = '', ...rest] = parts
  const comment = [cleanComment(before ?? ''), first].filter(Boolean).join(' ')
  const body = rest.filter(Boolean).join('\n\n')
  let moveGlyph: string | null = null
  let positionGlyph: string | null = null
  for (const nag of nags ?? []) {
    moveGlyph ??= atRoot ? null : (MOVE_NAGS[nag] ?? null)
    positionGlyph ??= POSITION_NAGS[nag] ?? null
  }
  return {
    comment: comment || null,
    body: body || null,
    moveGlyph,
    positionGlyph,
    drawings: [...drawingsOf(diag?.colorFields, false), ...drawingsOf(diag?.colorArrows, true)],
  }
}

function cleanComment(text: string): string {
  return text.replaceAll(SEPARATOR, ' ').trim()
}

function drawingsOf(codes: readonly string[] | undefined, arrows: boolean): Drawing[] {
  const drawings: Drawing[] = []
  for (const code of codes ?? []) {
    const match = (arrows ? /^([GRBY])([a-h][1-8])([a-h][1-8])$/ : /^([GRBY])([a-h][1-8])$/).exec(code)
    if (!match) continue
    const drawing: Drawing = { from: match[2], brush: BRUSH_OF[match[1]] }
    if (arrows) drawing.to = match[3]
    drawings.push(drawing)
  }
  return drawings
}

/** The tag pairs at the head of a PGN, in order, unescaped. */
function readTags(pgn: string): TagPair[] {
  const tags: TagPair[] = []
  const tag = /\s*\[\s*([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\s*\]/y
  for (let match = tag.exec(pgn); match; match = tag.exec(pgn)) {
    tags.push([match[1], match[2].replace(/\\(.)/g, '$1')])
  }
  return tags
}

/**
 * Joins each run of {comments} into one, with SEPARATOR where each began, as
 * the parser would join them anyway and lose where. Text in tags and in
 * ; comments is left alone.
 */
function separateComments(pgn: string): string {
  let out = ''
  let i = 0
  while (i < pgn.length) {
    const char = pgn[i]
    if (char === '"') {
      const end = closingQuote(pgn, i)
      out += pgn.slice(i, end)
      i = end
    } else if (char === ';') {
      const end = pgn.indexOf('\n', i)
      out += pgn.slice(i, end === -1 ? pgn.length : end)
      i = end === -1 ? pgn.length : end
    } else if (char === '{') {
      out += '{'
      i += 1
      for (;;) {
        const end = pgn.indexOf('}', i)
        if (end === -1) return out + pgn.slice(i)
        out += pgn.slice(i, end)
        i = end + 1
        const next = /^\s*\{/.exec(pgn.slice(i))
        if (!next) break
        out += SEPARATOR
        i += next[0].length
      }
      out += '}'
    } else {
      out += char
      i += 1
    }
  }
  return out
}

function closingQuote(text: string, open: number): number {
  for (let i = open + 1; i < text.length; i += 1) {
    if (text[i] === '\\') i += 1
    else if (text[i] === '"') return i + 1
  }
  return text.length
}

function describeParseError(error: unknown): string {
  // The parser reads a line of moves recursively, so a very long one can run out of stack.
  if (error instanceof RangeError) return 'The PGN has too many moves in one line to read.'
  const found = (error as { found?: unknown }).found
  const start = (error as { location?: { start?: { line: number; column: number } } }).location?.start
  const where = start ? ` at line ${start.line}, column ${start.column}` : ''
  if (typeof found === 'string') return `The PGN could not be read: unexpected “${found}”${where}.`
  if (found === null) return `The PGN could not be read: it ends too soon${where}.`
  return `The PGN could not be read: ${error instanceof Error ? error.message : String(error)}`
}

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
