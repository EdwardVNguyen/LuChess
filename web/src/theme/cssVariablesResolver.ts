import type { CSSVariablesResolver } from '@mantine/core'
import { colorTokens, fontTokens, radiusTokens, spacingTokens } from './tokens'

// Exposes the design tokens that don't map onto Mantine's own theme shape
// (flat surface colors, the board colors, fonts) as CSS variables, so CSS
// modules can use `var(--cn-ground)` etc. without reaching for raw hex.
// Mantine merges this with its own variables, it does not replace them.
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    '--cn-ink': colorTokens.ink,
    '--cn-muted': colorTokens.muted,
    '--cn-paper': colorTokens.paper,
    '--cn-ground': colorTokens.ground,
    '--cn-sidebar': colorTokens.sidebar,
    '--cn-margin-panel': colorTokens.marginPanel,
    '--cn-rule': colorTokens.rule,
    '--cn-card': colorTokens.card,
    '--cn-edge': colorTokens.edge,
    '--cn-highlight': colorTokens.highlight,
    '--cn-dashed': colorTokens.dashed,
    '--cn-accent': colorTokens.accent,
    '--cn-avatar': colorTokens.avatar,
    '--cn-board-light': colorTokens.boardLight,
    '--cn-board-dark': colorTokens.boardDark,
    '--cn-board-last-move': colorTokens.boardLastMove,
    '--cn-board-target': colorTokens.boardTarget,
    '--cn-board-drag-over': colorTokens.boardDragOver,
    '--cn-board-check': colorTokens.boardCheck,
    '--cn-piece-light': colorTokens.pieceLight,
    '--cn-piece-dark': colorTokens.pieceDark,
    '--cn-overlay': colorTokens.overlay,
    '--cn-dialog-shadow': colorTokens.dialogShadow,
    '--cn-prose': colorTokens.prose,
    '--cn-band-edge': colorTokens.bandEdge,
    '--cn-window-dot': colorTokens.windowDot,
    '--cn-lift-shadow': colorTokens.liftShadow,
    '--cn-card-shadow': colorTokens.cardShadow,
    '--cn-picture-shadow': colorTokens.pictureShadow,
    '--cn-font-serif': fontTokens.serif,
    '--cn-font-sans': fontTokens.sans,
    '--cn-font-symbols': fontTokens.symbols,
    '--cn-radius-button': radiusTokens.sm,
    '--cn-radius-card': radiusTokens.md,
    '--cn-radius-dialog': radiusTokens.lg,
    '--cn-radius-pill': radiusTokens.xl,
    '--cn-tree-indent': spacingTokens.treeIndent,
  },
  light: {},
  dark: {},
})
