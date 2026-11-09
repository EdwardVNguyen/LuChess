import { describe, expect, it } from 'vitest'
import { highlight, resultDetails } from './quickFind'

const marked = (query: string, text: string) =>
  highlight(query, text)
    .map((s) => (s.match ? `[${s.text}]` : s.text))
    .join('')

describe('highlight', () => {
  it('marks the query where it appears whole, ignoring case', () => {
    expect(marked('lace', 'Lovelace v. Hopper')).toBe('Love[lace] v. Hopper')
  })

  it('marks the characters in order when the query is misspelled', () => {
    expect(marked('hpper', 'Lovelace v. Hopper')).toBe('Lovelace v. [H]o[pper]')
  })

  it('marks the tightest run of characters', () => {
    expect(marked('spsky', 'Fischer v. Spassky')).toBe('Fischer v. [Sp]a[s]s[ky]')
  })

  it('marks nothing when the characters are not all there', () => {
    expect(marked('xyz', 'Lovelace')).toBe('Lovelace')
    expect(marked('  ', 'Lovelace')).toBe('Lovelace')
  })
})

describe('resultDetails', () => {
  const base = { id: 1, name: 'Club night', white: null, black: null, date: null, folderPath: [] }

  it('joins the players and the date', () => {
    expect(resultDetails({ ...base, white: 'Lovelace, Ada', black: 'Hopper, Grace', date: '1952.03.01' })).toBe(
      'Lovelace, Ada v. Hopper, Grace · 1952.03.01',
    )
  })

  it('drops unknown parts of the date', () => {
    expect(resultDetails({ ...base, white: 'Lovelace, Ada', date: '1952.??.??' })).toBe('Lovelace, Ada · 1952')
    expect(resultDetails({ ...base, date: '????.??.??' })).toBeNull()
  })

  it('is null when the PGN says nothing', () => {
    expect(resultDetails(base)).toBeNull()
  })

  it('shows the Folder path in place of the players', () => {
    expect(resultDetails({ ...base, white: 'Lovelace, Ada', folderPath: ['Masters', 'Spassky'] })).toBe('Masters / Spassky')
  })
})
