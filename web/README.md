# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

## Screenshot harness

`npm run shots` screenshots the frontend so it can be compared with `design/screenshots/`, with no API or
database running. Each entry in `scripts/shots/entries.ts` maps a design screen name to a route, a fixture set
(a logged-out visitor or a logged-in session) and optional setup steps; the API is mocked in the browser so the
output is the same every time.

The first time, install the browser Playwright drives:

```sh
npx playwright install chromium
```

```sh
npm run shots            # every entry
npm run shots -- Login   # a single entry, matched by name
```

It shoots a production build of the app (`vite build` in the `shots` mode, which keeps the `/dev/*` routes that a
normal build leaves out), served by `vite preview` on a free port, so it can run beside `npm run dev`. Captures run
in parallel; set `SHOTS_CONCURRENCY` to change how many.

For each entry this writes three PNGs to `web/shots/` (gitignored), named like the design files:

- `<Screen>.png` — desktop, 1440px wide
- `<Screen>-tablet.png` — tablet, 834px wide, full page
- `<Screen>-mobile.png` — mobile, 390px wide, full page

Entries render in Warm paper, the default theme. An entry with `theme: 'night'` or `theme: 'cool'` saves that
theme on the device before the page loads; the `-Night` and `-CoolPaper` entries use it.

When `design/screenshots/<Screen>.png` exists, it also writes `web/shots/compare/<Screen>.png` with the design
on the left and the build on the right, for a quick side-by-side diff.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
