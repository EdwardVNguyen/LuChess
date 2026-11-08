import { describe, expect, it } from 'vitest'
import { noteDetails, suggestedName } from './details'

describe('noteDetails', () => {
  it('joins Event, Site and Opening when present', () => {
    expect(noteDetails({ Event: 'Club night', Site: 'Leeds', Opening: 'Italian Game', Round: '3' })).toBe(
      'Club night · Leeds · Italian Game',
    )
    expect(noteDetails({ Opening: 'Italian Game' })).toBe('Italian Game')
  })

  it('is null without any of them', () => {
    expect(noteDetails({ White: 'Ada' })).toBeNull()
  })
})

describe('suggestedName', () => {
  it('uses the players’ surnames and the year', () => {
    expect(suggestedName({ White: 'Lovelace, Ada', Black: 'Hopper, Grace', Date: '1952.03.01' })).toBe(
      'Lovelace v. Hopper 1952',
    )
    expect(suggestedName({ White: 'Ada', Black: 'Grace' })).toBe('Ada v. Grace')
  })

  it('falls back to the event, then nothing', () => {
    expect(suggestedName({ Event: 'Club night' })).toBe('Club night')
    expect(suggestedName({})).toBeNull()
  })
})
