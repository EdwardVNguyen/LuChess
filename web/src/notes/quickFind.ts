import type { NoteSearchResult } from '../api'

export type Segment = { text: string; match: boolean }

// Splits text into the parts that match the query and the parts that don't,
// to show why a result was found. The server matches by trigrams, which
// can't say which characters matched, so this approximates it: the query as
// one piece if it appears whole, else its characters in order ("spsky" in
// "Spassky"), else nothing.
export function highlight(query: string, text: string): Segment[] {
  const q = query.trim().toLowerCase()
  const lower = text.toLowerCase()
  const marks = new Array<boolean>(text.length).fill(false)

  const at = q === '' ? -1 : lower.indexOf(q)
  if (at >= 0) {
    marks.fill(true, at, at + q.length)
  } else if (q !== '') {
    // The tightest run of the query's characters in order, so "spsky" marks
    // the letters of "Spassky" and not a stray "s" earlier on.
    const chars = [...q].filter((char) => char !== ' ')
    let picked: number[] = []
    for (let start = lower.indexOf(chars[0]); start >= 0; start = lower.indexOf(chars[0], start + 1)) {
      const run = [start]
      for (const char of chars.slice(1)) {
        const found = lower.indexOf(char, run[run.length - 1] + 1)
        if (found < 0) break
        run.push(found)
      }
      if (run.length < chars.length) break
      if (picked.length === 0 || run[run.length - 1] - run[0] < picked[picked.length - 1] - picked[0]) picked = run
    }
    for (const index of picked) marks[index] = true
  }

  const segments: Segment[] = []
  for (let i = 0; i < text.length; i++) {
    const last = segments.at(-1)
    if (last && last.match === marks[i]) last.text += text[i]
    else segments.push({ text: text[i], match: marks[i] })
  }
  return segments
}

/** "Lovelace, Ada v. Hopper, Grace · 1952.03.01", leaving out what the PGN doesn't say. */
export function resultDetails({ white, black, date }: NoteSearchResult): string | null {
  const players = white && black ? `${white} v. ${black}` : (white ?? black)
  // PGN marks unknown parts of a date with "??": "1952.??.??" is just 1952.
  const known = date?.replace(/(\.\?\?)+$/, '')
  const parts = [players, known && !known.startsWith('?') ? known : null].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}
