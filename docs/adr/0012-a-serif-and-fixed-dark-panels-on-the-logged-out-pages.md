# A serif and fixed dark panels on the logged-out pages

The logged-out Home, Log in and Sign up pages were redesigned (`design/pages/`). On these pages, and on the other auth pages that share Log in's layout, we make two exceptions to docs/adr/0008:

- **Headings use Source Serif 4**, self-hosted like Inter, so the pages read like the book the product describes. Body text, labels, buttons and everything inside the app stay in Inter.
- **The Home hero and the auth pages' form panel are always dark**, with cream text and tan buttons and links, in every theme. They sit over or beside a black-and-white photo, so they are part of the picture rather than the page, the way the board keeps its own look (docs/adr/0007). Their colours are a fixed set of tokens outside the theme palettes. The rest of these pages (the sections below the hero, the header and the footer) still follows the current theme.

The redesign's Articles and Play content stays out, because v1 is the study view only (docs/adr/0001).

## Considered options

- **Inter and theme colours everywhere, as in 0008.** It keeps one rule, but on Warm paper and Cool paper the hero and form panel would turn light, and the photo would lose the dark frame the design depends on.
- **A serif with theme colours.** It keeps the type but loses the dark panels on light themes, for the same reason.

## Consequences

The serif adds one more self-hosted font family to the first load of these pages. The fixed panel tokens are, besides the board's, the only colours that ignore the theme, so they have to be readable on their own dark background and never be reused elsewhere.
