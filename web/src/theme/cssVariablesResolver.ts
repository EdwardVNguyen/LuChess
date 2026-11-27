import type { CSSVariablesResolver } from '@mantine/core'
import { boardTokens, fontTokens, panelTokens, radiusTokens, spacingTokens } from './tokens.ts'

// Exposes the tokens that are the same in every theme (the board, the
// logged-out pages' dark panels, the fonts, radii, spacing) as CSS variables, so CSS modules can use `var(--cn-font)`
// etc. without reaching for raw values. The colours that change with the
// theme are set per theme by themeCss.ts. Mantine merges this with its own
// variables, it does not replace them.
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    '--cn-board-light': boardTokens.light,
    '--cn-board-dark': boardTokens.dark,
    '--cn-board-shadow': boardTokens.shadow,
    '--cn-board-last-move': boardTokens.lastMove,
    '--cn-board-selected': boardTokens.selected,
    '--cn-board-target': boardTokens.target,
    '--cn-board-drag-over': boardTokens.dragOver,
    '--cn-board-check': boardTokens.check,
    '--cn-board-brush-green': boardTokens.brushGreen,
    '--cn-board-brush-red': boardTokens.brushRed,
    '--cn-board-brush-blue': boardTokens.brushBlue,
    '--cn-board-brush-yellow': boardTokens.brushYellow,
    '--cn-panel-background': panelTokens.background,
    '--cn-panel-field': panelTokens.field,
    '--cn-panel-field-edge': panelTokens.fieldEdge,
    '--cn-panel-heading': panelTokens.heading,
    '--cn-panel-text': panelTokens.text,
    '--cn-panel-label': panelTokens.label,
    '--cn-panel-hint': panelTokens.hint,
    '--cn-panel-tan': panelTokens.tan,
    '--cn-panel-tan-hover': panelTokens.tanHover,
    '--cn-panel-error': panelTokens.error,
    '--cn-font': fontTokens.sans,
    '--cn-font-serif': fontTokens.serif,
    '--cn-radius-button': radiusTokens.sm,
    '--cn-radius-card': radiusTokens.md,
    '--cn-radius-dialog': radiusTokens.lg,
    '--cn-radius-pill': radiusTokens.xl,
    '--cn-tree-indent': spacingTokens.treeIndent,
    '--cn-pane-rail': spacingTokens.paneRail,
  },
  light: {},
  dark: {},
})
