// The Glyphs a Ply can carry (GLOSSARY.md): at most one about the move and
// one about the position it leads to. Ply 0 has no move, so only the latter.

export const moveGlyphs = [
  { glyph: '!!', name: 'Brilliant move' },
  { glyph: '!', name: 'Good move' },
  { glyph: '!?', name: 'Interesting move' },
  { glyph: '?!', name: 'Dubious move' },
  { glyph: '?', name: 'Mistake' },
  { glyph: '??', name: 'Blunder' },
] as const

export const positionGlyphs = [
  { glyph: '+−', name: 'White is winning' },
  { glyph: '±', name: 'White is better' },
  { glyph: '⩲', name: 'White is slightly better' },
  { glyph: '=', name: 'Equal position' },
  { glyph: '∞', name: 'Unclear position' },
  { glyph: '⩱', name: 'Black is slightly better' },
  { glyph: '∓', name: 'Black is better' },
  { glyph: '−+', name: 'Black is winning' },
] as const

const names = new Map<string, string>([...moveGlyphs, ...positionGlyphs].map((g) => [g.glyph, g.name]))

/** What a Glyph means, for screen readers and tooltips. */
export function glyphName(glyph: string): string {
  return names.get(glyph) ?? glyph
}
