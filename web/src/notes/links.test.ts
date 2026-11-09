import { describe, expect, it } from 'vitest'
import { backlinkPlace, connections, cutShown, linkTargets, linkToken, moveNumberAt, parseLinks, showLinks, type LinkStatus } from './links'

describe('parseLinks', () => {
  it('splits text into plain runs and Links, with or without a label', () => {
    expect(parseLinks('The [[note:4]]: see [[note:5| hanging pawns ]].')).toEqual([
      { kind: 'text', text: 'The ' },
      { kind: 'link', target: 4, label: null },
      { kind: 'text', text: ': see ' },
      { kind: 'link', target: 5, label: 'hanging pawns' },
      { kind: 'text', text: '.' },
    ])
  })

  it('treats a blank label as none, and leaves look-alikes as text', () => {
    expect(parseLinks('[[note:7|  ]]')).toEqual([{ kind: 'link', target: 7, label: null }])
    for (const text of ['[[note:0]]', '[[note:abc]]', '[[Hanging pawns]]', '[[note:1|a]b]]', '[[note:1234567890123456]]']) {
      expect(parseLinks(text)).toEqual([{ kind: 'text', text }])
    }
  })

  it('lists each target once, in order', () => {
    expect(linkTargets('[[note:2]] [[note:1|x]] [[note:2|y]]')).toEqual([2, 1])
  })
})

describe('linkToken', () => {
  it('writes a token that reads back the same', () => {
    expect(linkToken(42)).toBe('[[note:42]]')
    expect(linkToken(42, '  ')).toBe('[[note:42]]')
    expect(linkToken(42, 'the [pawns]\non d5')).toBe('[[note:42|the [pawns on d5]]')
    expect(parseLinks(linkToken(42, 'a]]b'))).toEqual([{ kind: 'link', target: 42, label: 'a b' }])
  })
})

describe('showLinks', () => {
  const resolve = (target: number): LinkStatus =>
    target === 1 ? { status: 'resolved', name: 'Hanging pawns' } : target === 2 ? { status: 'unresolved' } : { status: 'unknown' }

  it('shows the label, else the current name, else that the target is gone', () => {
    const shown = showLinks(parseLinks('[[note:1]] [[note:1|pawns]] [[note:2]] [[note:2|old]] [[note:3]]'), resolve)
    expect(shown.filter((p) => p.link).map((p) => [p.text, p.link?.status])).toEqual([
      ['Hanging pawns', 'resolved'],
      ['pawns', 'resolved'],
      ['Deleted note', 'unresolved'],
      ['old', 'unresolved'],
      ['Linked note', 'unknown'],
    ])
  })

  it('cuts long text at a word without cutting through a Link', () => {
    const shown = showLinks(parseLinks('One two three [[note:1]] four five six seven'), resolve)
    expect(cutShown(shown, 30).map((p) => p.text)).toEqual(['One two three ', 'Hanging pawns', '…'])
    expect(cutShown(shown, 20).map((p) => p.text)).toEqual(['One two three', '…'])
  })
})

describe('backlinkPlace', () => {
  it('names the move from the standard start', () => {
    expect(moveNumberAt(null, 1)).toBe('1.')
    expect(moveNumberAt(null, 20)).toBe('10…')
    expect(backlinkPlace({ part: 'comment', ply: 20, startFen: null })).toBe('Comment on move 10…')
    expect(backlinkPlace({ part: 'body', ply: 21, startFen: null })).toBe('Body after move 11.')
  })

  it('names the move from a custom Position', () => {
    const blackToMove = '8/8/8/4k3/8/8/4P3/4K3 b - - 0 40'
    expect(moveNumberAt(blackToMove, 1)).toBe('40…')
    expect(moveNumberAt(blackToMove, 2)).toBe('41.')
  })

  it('names the Position at ply 0', () => {
    expect(backlinkPlace({ part: 'comment', ply: 0, startFen: null })).toBe('Comment on the position')
    expect(backlinkPlace({ part: 'body', ply: 0, startFen: null })).toBe('Body opening the note')
  })
})

describe('connections', () => {
  it('lists targets in reading order, each with the first label it was given', () => {
    expect(
      connections([
        { ply: 3, comment: '[[note:1]]', body: '[[note:2|two]]' },
        { ply: 0, comment: null, body: '[[note:1]] [[note:3]] [[note:1|one]]' },
      ]),
    ).toEqual([
      { target: 1, label: 'one' },
      { target: 3, label: null },
      { target: 2, label: 'two' },
    ])
  })
})
