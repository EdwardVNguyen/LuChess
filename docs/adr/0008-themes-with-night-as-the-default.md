# Themes, with Night as the default, and Inter everywhere

The site's colours and fonts depart from `design/`. Instead of the design's warm paper palette with Newsreader for writing and Hanken Grotesk for chrome, the site has three themes and uses **Inter** for all text:

- **Night** (the default): a dark palette after Tokyo Night, with deep navy surfaces, pale blue-grey text and a blue accent.
- **Cool paper**: a light palette with an off-white page, slate ink and a deep blue accent.
- **Warm paper**: the design's original palette (paper, ink, oxblood).

Settings also offers **Match system**, which uses Night when the device is in dark mode and Cool paper when it is in light mode. The choice is saved on the device, not the account, so it applies before the page draws, needs no API change, and works the same for Guests and logged-out visitors.

We chose this from a throwaway prototype (#52, branch `theme-prototype`) that switched seven palettes and four font pairings live across the site. The board keeps its own colours in every theme (docs/adr/0007).

## Considered options

- **Keep the design's look.** It was a candidate in the prototype and stays available as Warm paper, but Night with Inter was preferred as the default.
- **Save the theme on the account.** It would follow a user across devices, but needs an API field, still needs a device fallback for Guests, and would show the default until the Session restores.
- **Keep a serif for writing.** Newsreader, Source Serif 4 and Literata were tried alongside a sans for chrome; Inter alone was chosen.

## Consequences

Colours and fonts no longer match `design/screenshots/`, so screenshot comparisons differ there by design; layout, spacing and radii still follow the designs. Every colour must come from the current theme's tokens, because a value that looks right in one theme can be unreadable in another. On Night, filled buttons are light with dark text, since the primary colour is the theme's ink.
