import { parse } from '@mliebelt/pgn-parser'
import { validateFen as chessJsValidateFen } from 'chess.js'
import { START_FEN, type Result } from './chess.ts'
import {
  BRUSH_OF,
  hasWriting,
  MAX_MOVES,
  MAX_PGN_BYTES,
  MOVE_NAGS,
  POSITION_NAGS,
  SEPARATOR,
  type Drawing,
  type ImportedNote,
  type TagPair,
  type Writing,
} from './pgn.ts'
import { addMove, moveCount, newTree, type MoveId } from './tree.ts'

// Reading a PGN (ADR 0009). This module holds @mliebelt/pgn-parser, which is
// large, so the app reaches it only through loadPgnImport() in pgn.ts, and it
// loads as its own chunk when a form that reads PGN opens.

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
  // At the root, every comment opens the Note as its Body: Comments are on Moves (#97).
  if (atRoot) parts.unshift('')
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
    drawings: onlyOnce([...drawingsOf(diag?.colorFields, false), ...drawingsOf(diag?.colorArrows, true)]),
  }
}

function cleanComment(text: string): string {
  return text.replaceAll(SEPARATOR, ' ').trim()
}

// A Move has each shape once (#77): the first of a circle or arrow drawn twice wins.
function onlyOnce(drawings: Drawing[]): Drawing[] {
  const seen = new Set<string>()
  return drawings.filter((d) => {
    const shape = `${d.from}${d.to ?? ''}`
    if (seen.has(shape)) return false
    seen.add(shape)
    return true
  })
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

