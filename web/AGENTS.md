# Frontend rules

Read these before doing any frontend work.

## Where to look

The visual target is `design/screenshots/<Screen>.png`, `<Screen>-tablet.png` and `<Screen>-mobile.png`. Read the PNG first, then `design/screens/<Screen>*.dc.html` for exact values. `design/wireframes/` shows intent only.

## The glossary wins

The designs show intent and possible layouts. `GLOSSARY.md` and `docs/adr/` decide names and behaviour. Code and API use glossary terms. How the design maps onto them:

| Design | Glossary | v1 |
|---|---|---|
| The big idea | the Body at ply 0 | yes |
| Line of thought | the move list with Glyphs, Comments and Bodies | yes |
| "Add a thought… type [[ to link" | the editor for a Comment or Body, with no 280-character counter | yes |
| Sub-variation at move N | ordinary text in a Comment or Body (ADR 0003) | text only |
| Connections | the Links in this Note's Comments and Bodies | yes |
| Linked from | Backlinks | yes |
| Reader notes, red numbered badges | other users' writing | no |
| Study / Read toggle, Settings article view | Articles | no |
| Folder "Who can see it" | Notes are private | no |

The site's colours and fonts depart from the designs too: it has three themes (Night by default, Cool paper, Warm paper) and uses Inter for all text (docs/adr/0008), so colours and fonts won't match `design/screenshots/`. Layout, spacing and radii still follow the designs. The board also has its own look: its pieces, squares, frame, coordinates and highlights are our own and stay the same in every theme (docs/adr/0007), so boards won't match `design/screenshots/` either.

## Not in v1 (ADR 0001)

Don't build Library, All studies, Articles, Play, following, saving or bookmarks, even when a screen shows them.

## Navigation shows only what exists

No Library or Play tabs, and no mobile bottom tab bar, until a second area exists.

## Tokens, not values

Colours, fonts, radii and spacing come from the theme. Never write raw hex values or copy inline styles out of the `.dc.html` files. If a value is missing, add it to the theme.

## One responsive component per screen

Use the theme's breakpoints. Don't build three versions of a screen.

## Shared parts

Overlays use the shared responsive overlay component, and every board uses the shared `Board`.

## Sample data is not content

Fischer v. Spassky, the Najdorf and the people's names belong only in fixtures for tests and the screenshot harness.

## Undesigned states

Hover, focus, empty, loading and error states aren't designed. Build them in the same style and include them in the PR screenshots.

## Screenshot harness

`npm run shots` (optionally `-- <Screen>` for one entry) screenshots the frontend with the API mocked, so it
can be compared with `design/screenshots/`, with no backend running. Add an entry to `scripts/shots/entries.ts`
for every screen you touch. See `web/README.md` for details.

## Definition of done

- `npm run build`, `npm run lint` and `npm test` pass.
- The PR includes `npm run shots` output: the comparison images at 1440, 834 and 390px for every screen it touches (`web/shots/compare/`), or the plain screenshots when no matching design exists yet.
