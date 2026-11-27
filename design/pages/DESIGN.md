# LuChess design handoff: Home, Log in, Sign up

This folder is the source of truth for three pages: the logged-out **Home** page, **Log in**, and **Sign up**. Build them in the existing React frontend so they match the reference HTML and screenshots at all three breakpoints.

## What's in here

```
design/
  pages/
    DESIGN.md                   ← this file: tokens, layout rules, behaviour
    styles.css                  ← every token and responsive rule (reference CSS)
    home.html                   ← logged-out homepage
    login.html
    signup.html
    img/
      hero-fischer-tal-1960.jpg ← Home hero (CC BY-SA, credit required)
      auth-tal-1964.jpg         ← Log in + Sign up (CC0)
      study-view.png            ← screenshot used in "Ideas stick when they connect"
  screenshots/
    HomeLoggedOut.png, Login.png, SignUp.png                      (desktop, 1440)
    HomeLoggedOut-tablet.png, Login-tablet.png, SignUp-tablet.png (tablet, 834)
    HomeLoggedOut-mobile.png, Login-mobile.png, SignUp-mobile.png (mobile, 390)
```

The HTML files are static references with plain semantic markup and no JavaScript. Open them in a browser and resize the window to see every breakpoint. Port the structure into React components. Don't copy the HTML in wholesale.

**What v1 builds of this design is decided by `web/AGENTS.md` and `docs/adr/`, not by this file.** In particular, Articles and Play are not in v1 (ADR 0001), and the fonts and fixed dark panels are covered by ADR 0012.

## Breakpoints

| Name    | Width          | Screenshot width |
|---------|----------------|------------------|
| Mobile  | ≤ 640px        | 390              |
| Tablet  | 641–1024px     | 834              |
| Desktop | ≥ 1025px       | 1440             |

Content max width is **1180px**. The side gutter is **64 / 32 / 20px** (desktop / tablet / mobile).

## Design tokens

Use these as CSS custom properties, or as your theme object. Names are suggestions; the values are fixed.

| Token | Value | Use |
|---|---|---|
| `--paper` | `#f8f4eb` | Page background |
| `--paper-raised` | `#fffdf7` | Article cards |
| `--paper-soft` | `#fbf8f1` | Image frames, light button |
| `--band` | `#ece4d4` | Alternating section background |
| `--line` | `#ddd2bf` | Borders, FAQ dividers |
| `--line-soft` | `#e6dccb` | Header bottom rule |
| `--ink` | `#2b2824` | Primary text, dark button, CTA band |
| `--ink-2` | `#3d3833` | Checklist text |
| `--ink-3` | `#4a4239` | Body copy, nav links |
| `--muted` | `#6e675e` | Eyebrow labels, meta text |
| `--accent` | `#9e2b25` | Links, 1/2/3 numerals, bookmark ribbons, check marks |
| `--accent-hover` | `#6f1f19` | Link hover |
| `--night` | `#1a1714` | Home hero background, auth form panel |
| `--night-field` | `#26221e` | Inputs on dark |
| `--night-line` | `#4a4239` | Input borders on dark |
| `--on-night` | `#fbf8f1` | Headings on dark |
| `--on-night-2` | `#e6dccb` | Body text on dark |
| `--on-night-3` | `#cfc4b0` | Labels, secondary on dark |
| `--on-night-4` | `#a89f8f` | Hints, photo credits on dark |
| `--tan` | `#e3bd7c` | Primary button on dark, links on dark, focus ring |
| `--tan-hover` | `#f0d29c` | Hover for the above |

**Fonts (Google Fonts):**
- **Source Serif 4** (400, 600, 400 italic) for headings, ledes, step text, FAQ, article titles and the italic "LuChess" wordmark.
- **Inter** (400, 500, 600) for UI, labels, buttons, nav and meta text.

**Type scale (desktop / tablet / mobile):**

| Element | Font | Size |
|---|---|---|
| Hero h1 | serif 400 | 66 / 54 / 40px, line-height 1.05, letter-spacing −0.01em |
| Section h2 | serif 400 | 40 / 34 / 30px, line-height 1.12 |
| Closing CTA h2 | serif | 46 / 46 / 34px |
| Auth h1 | serif | 56 / 56 / 40px |
| Hero lede | serif | 20px (18px mobile), line-height 1.55 |
| Section lede | serif | 18px, line-height 1.6 |
| Eyebrow | Inter 600 | 12px, uppercase, letter-spacing 0.14em, `--muted` |
| Body UI | Inter | 15px |

**Radii:** 4px for buttons and cards, 8px for form fields, the auth submit button and image frames.

**Buttons:** 46px tall (38px in the header), 22px horizontal padding, Inter 500. The auth submit button is 52px tall, full width, Inter 600.

## Home page (`home.html`)

Sections in order:

1. **Header** (`--paper`, 1px `--line-soft` bottom rule)
   - Contents: the italic serif "LuChess" wordmark, nav (Articles / How it works / FAQ), a spacer, a "Log in" text link and a dark "Sign up" button.
   - **Mobile:** nav and "Log in" are hidden and a menu button appears. The menu drawer isn't designed yet; a simple full-width dropdown with the same links plus "Log in" is fine.
2. **Hero** (dark)
   - Background `--night`.
   - **Desktop:** the photo fills the right 62%, cropped with `object-position: 35% 30%`, with the filter `grayscale(1) sepia(.12) contrast(1.05) brightness(.88)`. A horizontal gradient runs from solid `--night` at 0–38% to nearly clear at 72%, plus a 160px dark fade at the bottom.
   - **Tablet:** the photo goes full width and the gradient gets stronger.
   - **Mobile:** text is aligned to the bottom, with a vertical gradient so the photo shows at the top.
   - Copy: eyebrow, h1, lede, then two buttons (tan "Sign up free" and outlined "Try as a guest"), then a note with a tan link.
   - **The photo credit line at the bottom-left is required by the image license. Never remove it.**
3. **How it works** (`--band`)
   - Eyebrow, h2 "Read it. Connect it. Play it.", then three steps, each with an italic serif numeral in `--accent`, an h3 and a paragraph.
   - **Desktop and tablet:** 3 columns. **Mobile:** 1 column.
4. **Luhmann's method**
   - Text on the left: eyebrow, h2, lede, and a checklist with `--accent` check marks.
   - On the right: the Study view screenshot inside a "browser" frame (three 9px dots, 1px border, 8px radius, soft shadow).
   - **Tablet and mobile:** stacked, with the image below the text.
5. **Learn from people** (`--band`)
   - Same layout as section 4.
   - **The image is a placeholder.** Replace it with a real Read view screenshot in the same browser frame.
6. **Open to everyone**
   - Eyebrow, h2, lede, then article cards: 3 columns on desktop, 2 on tablet, 1 on mobile.
   - Cards: `--paper-raised`, 1px border, 4px radius. A red bookmark ribbon (SVG, 22×46) sits 22px from the right edge, 4px above the card.
   - Card content: eyebrow category, serif 24px title, meta line.
   - Cards should come from the articles API (latest 3 public articles).
7. **FAQ**
   - Heading on the left (300px column on desktop, stacked on tablet and mobile).
   - Use `<details>`/`<summary>` or an accessible accordion. "+" changes to "–" when open.
   - The answer to "What can I do as a guest?" is a placeholder and needs real copy.
8. **Closing CTA** (`--ink` band, centered)
   - h2, line, then a light "Sign up free" button and an outlined "Log in" button.
   - **Mobile:** buttons go full width and stack.
9. **Footer**
   - Brand plus tagline, then three link columns (Read / LuChess / Legal).
   - **Desktop:** 4 columns. **Tablet:** brand on its own row, then 3 columns. **Mobile:** brand row, then 2 columns.

## Log in and Sign up (`login.html`, `signup.html`)

Split layout, based on the Epidemic Sound login.

- **Desktop:** a two-column grid, `1fr | 1.15fr`, at least the full viewport height.
  - **Left:** the form panel on `--night`, with 48px top and bottom padding and 10% side padding. It holds:
    - the logo (tan knight mark plus the italic serif "LuChess" in cream) at the top
    - the form block, vertically centered, max width 420px
    - a small footer line at the bottom
  - **Right:** the photo, with `object-fit: cover` and `object-position: 58% 40%`, the same filter as the hero, a soft dark fade from the left edge and a dark fade along the bottom. A serif quote (28px) and the photo credit sit bottom-left.
- **Tablet:** the photo becomes a 300px band at the top, with the logo over its top-left corner. The form is centered below and the footer line stays at the bottom.
- **Mobile:** the photo band is 200px. The quote is hidden; the credit stays at 10.5px.

**Form fields:**
- Visible labels: Inter 13px 500, `--on-night-3`.
- Inputs: 52px tall, `--night-field` background, 1px `--night-line` border, 8px radius, 16px text (keeps iOS from zooming in).
- Focus state: a 2px `--tan` outline.
- Hints sit under the field in `--on-night-4`. Error messages use the same spot in `#f08a80`.
- The password field has a 44×44 show/hide button inside its right edge. It switches the input type and toggles `aria-pressed` and `aria-label`.

**Log in:**
- h1 "Log in", then "New here? Create an account", then Email and Password fields, then a right-aligned "Forgot password?" link.
- Then the full-width tan "Log in" button and "Just looking? Read articles without an account".
- Footer line: Terms · Privacy.
- Photo quote: "Remember chess the way you remember a good story."

**Sign up:**
- h1 "Create your account", then "Already have one? Log in".
- Fields:
  - Email
  - Display name, with the hint "Shown to others. Must be unique."
  - Password, with the hint "10 to 128 characters." Enforce `minlength=10`, `maxlength=128`.
- Then the tan "Sign up" button, then a Terms/Privacy agreement line.
- Footer line: "Reading articles never needs an account. Browse articles".
- Photo quote: "One note for every game, linked to the ideas behind it."

There's no site header on the auth pages; the logo links back to Home.

## Accessibility

- Every input has a visible `<label>`. Hints are linked with `aria-describedby`.
- All touch targets are at least 44px.
- Text colors meet 4.5:1 contrast on their backgrounds. Don't lighten `--muted` or `--on-night-4`.
- Decorative SVGs (ribbons, numerals) use `aria-hidden="true"`. Photos have descriptive `alt` text.

## Image licenses (keep the credits)

| File | Used on | License | Credit to display |
|---|---|---|---|
| `hero-fischer-tal-1960.jpg` | Home hero | CC BY-SA 3.0 DE, credit **required** | "Fischer v. Tal, Leipzig 1960 · Photo: Bundesarchiv, Bild 183-76052-0335 / Kohls, Ulrich · CC BY-SA 3.0 DE · cropped and toned", linked to the [Commons file](https://commons.wikimedia.org/wiki/File:Bundesarchiv_Bild_183-76052-0335,_Schacholympiade,_Tal_(UdSSR)_gegen_Fischer_(USA).jpg) and the [license](https://creativecommons.org/licenses/by-sa/3.0/de/deed.en) |
| `auth-tal-1964.jpg` | Log in, Sign up | CC0 (credit optional, kept as courtesy) | "Mikhail Tal, Amsterdam Interzonal 1964 · Photo: Harry Pot for Anefo, CC0, via Wikimedia Commons", linked to the [Commons file](https://commons.wikimedia.org/wiki/File:Interzonaal_fide_schaaktoernooi_in_GAK_gebouw,_Tal_in_die_concentratie_te_midden,_Bestanddeelnr_916-4754.jpg) |

The hero image file is only 768px wide. For a sharper hero, download the full-resolution original from the Commons page. The CSS filter and crop stay the same.

## Not covered yet

- The mobile menu drawer (see Home, section 1).
- The real Read view screenshot (Home, section 5).
- The guest FAQ answer (Home, section 7).
- Final logo: the knight mark on the auth pages is a placeholder. Use the existing laurel-knight logo.
- Logged-in pages (Study, Library, Play) are unchanged and out of scope here.
