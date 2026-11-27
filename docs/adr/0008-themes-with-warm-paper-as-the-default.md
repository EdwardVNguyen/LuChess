# Themes, with Warm paper as the default, and Inter everywhere

The site departs from `design/` in its fonts and, optionally, its colours. Instead of Newsreader for writing and Hanken Grotesk for chrome, it uses **Inter** for all text, and instead of only the design's palette it has three themes:

- **Warm paper** (the default): the design's original palette (paper, ink, oxblood).
- **Night**: a dark palette after Tokyo Night, with deep navy surfaces, pale blue-grey text and a blue accent.
- **Cool paper**: a light palette with an off-white page, slate ink and a deep blue accent.

Settings also offers **Match system**, which uses Night when the device is in dark mode and Cool paper when it is in light mode. The choice is saved on the device, not the account, so it applies before the page draws, needs no API change, and works the same for Guests and logged-out visitors.

We chose this from a throwaway prototype (#52, branch `theme-prototype`) that switched seven palettes and four font pairings live across the site. The board keeps its own colours in every theme (docs/adr/0007).

## Considered options

- **Night as the default.** The prototype first picked Night, and it stays available, but before release (#66) the default became Warm paper: the design's own palette, now with Inter.
- **Save the theme on the account.** It would follow a user across devices, but needs an API field, still needs a device fallback for Guests, and would show the default until the Session restores.
- **Keep a serif for writing.** Newsreader, Source Serif 4 and Literata were tried alongside a sans for chrome; Inter alone was chosen.

## Consequences

Fonts no longer match `design/screenshots/`, and nor do colours outside Warm paper, so screenshot comparisons differ there by design; layout, spacing and radii still follow the designs. Every colour must come from the current theme's tokens, because a value that looks right in one theme can be unreadable in another. On Night, filled buttons are light with dark text, since the primary colour is the theme's ink.

The logged-out pages later took a serif for headings and fixed dark panels (docs/adr/0012).
