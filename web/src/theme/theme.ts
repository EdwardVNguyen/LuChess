import {
  Button,
  Card,
  createTheme,
  Drawer,
  Input,
  InputWrapper,
  Menu,
  Modal,
  PasswordInput,
  Popover,
  Radio,
  RadioIndicator,
  Textarea,
  TextInput,
  defaultVariantColorsResolver,
  parseThemeColor,
  type VariantColorsResolver,
} from '@mantine/core'
import { colorTheme } from './colors'
import { breakpointTokens, fontTokens, palettes, radiusTokens } from './tokens'

// Colours here are CSS variables, never values: each theme sets them
// (themeCss.ts), so one theme object serves all three and switching needs no
// re-render. The ramps below are Warm paper's, but only as Mantine's starting
// point; each theme overrides them.

// Mantine picks a filled button's text colour from the ramp it was given, in
// JavaScript, once. Ink is light on Night and dark elsewhere, so ink and
// accent read it from each theme's `-contrast` variable instead.
const variantColorResolver: VariantColorsResolver = (input) => {
  const colors = defaultVariantColorsResolver(input)
  const parsed = parseThemeColor({ color: input.color || input.theme.primaryColor, theme: input.theme })
  if (input.variant === 'filled' && (parsed.color === 'ink' || parsed.color === 'accent')) {
    return { ...colors, color: `var(--mantine-color-${parsed.color}-contrast)` }
  }
  return colors
}

// The small uppercase, letter-spaced labels used throughout the designs
// (e.g. "FOLDER NAME", "WHO CAN SEE IT").
const uppercaseLabel = {
  fontFamily: fontTokens.sans,
  fontSize: '12px',
  fontWeight: 600,
  letterSpacing: '.09em',
  textTransform: 'uppercase' as const,
  color: 'var(--cn-muted)',
}

export const theme = createTheme({
  fontFamily: fontTokens.sans,
  fontFamilyMonospace: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  ...colorTheme(palettes.warm),
  variantColorResolver,
  defaultRadius: 'sm',
  cursorType: 'pointer',
  radius: radiusTokens,
  breakpoints: breakpointTokens,
  headings: {
    fontFamily: fontTokens.sans,
    fontWeight: '500',
    textWrap: 'balance',
    sizes: {
      // A size or two below the design's, which were set for Newsreader:
      // Inter is larger at the same size (docs/adr/0008).
      h1: { fontSize: '30px', lineHeight: '1.2', fontWeight: '500' },
      h2: { fontSize: '24px', lineHeight: '1.25', fontWeight: '500' },
      h3: { fontSize: '19px', lineHeight: '1.3', fontWeight: '500' },
      h4: { fontSize: '17px', lineHeight: '1.35', fontWeight: '500' },
      h5: { fontSize: '16px', lineHeight: '1.4', fontWeight: '500' },
      h6: { fontSize: '14px', lineHeight: '1.4', fontWeight: '500' },
    },
  },
  components: {
    Button: Button.extend({
      defaultProps: { variant: 'filled' },
      styles: {
        root: { fontFamily: fontTokens.sans, fontWeight: 500, fontSize: '14px' },
      },
      vars: (_theme, props) => {
        if (props.variant === 'outline') {
          return { root: { '--button-bd': '1px solid var(--cn-edge)', '--button-color': 'var(--cn-ink)' } }
        }
        return { root: {} }
      },
    }),
    TextInput: TextInput.extend({
      defaultProps: { radius: 'sm' },
      styles: { input: { fontFamily: fontTokens.sans, fontSize: '16px' } },
    }),
    PasswordInput: PasswordInput.extend({
      defaultProps: { radius: 'sm' },
      styles: { input: { fontFamily: fontTokens.sans, fontSize: '16px' } },
    }),
    Textarea: Textarea.extend({
      defaultProps: { radius: 'sm' },
      styles: { input: { fontFamily: fontTokens.sans, fontSize: '16px' } },
    }),
    Input: Input.extend({
      styles: { input: { borderColor: 'var(--cn-edge)', backgroundColor: 'var(--cn-card)' } },
    }),
    InputWrapper: InputWrapper.extend({
      styles: { label: uppercaseLabel, description: { fontFamily: fontTokens.sans } },
    }),
    Card: Card.extend({
      defaultProps: { radius: 'md', withBorder: true, padding: 'lg' },
      styles: { root: { backgroundColor: 'var(--cn-card)', borderColor: 'var(--cn-edge)' } },
    }),
    Modal: Modal.extend({
      defaultProps: { radius: 'lg', centered: true, overlayProps: { color: 'var(--cn-shadow-base)', backgroundOpacity: 0.45 } },
      styles: {
        content: { backgroundColor: 'var(--cn-paper)' },
        title: { fontFamily: fontTokens.sans, fontSize: '24px', fontWeight: 500 },
      },
    }),
    Drawer: Drawer.extend({
      defaultProps: { radius: 'lg', overlayProps: { color: 'var(--cn-shadow-base)', backgroundOpacity: 0.45 } },
      styles: (_theme, props) => ({
        content: {
          backgroundColor: 'var(--cn-paper)',
          // A bottom sheet sits flush with the screen edge, so only its top
          // corners are rounded (NewFolder-mobile, ArticleSave-mobile).
          ...(props.position === 'bottom' ? { borderRadius: `${radiusTokens.lg} ${radiusTokens.lg} 0 0` } : {}),
        },
        title: { fontFamily: fontTokens.sans, fontSize: '24px', fontWeight: 500 },
      }),
    }),
    Popover: Popover.extend({
      defaultProps: { radius: 'md', shadow: 'md' },
      styles: { dropdown: { backgroundColor: 'var(--cn-paper)', borderColor: 'var(--cn-edge)' } },
    }),
    RadioIndicator: RadioIndicator.extend({
      defaultProps: { iconColor: 'var(--mantine-primary-color-contrast)' },
    }),
    Radio: Radio.extend({
      // The dot's colour, which Mantine would otherwise fix from Warm paper's ramp.
      defaultProps: { iconColor: 'var(--mantine-primary-color-contrast)' },
      styles: { label: { fontFamily: fontTokens.sans, fontSize: '15px' }, radio: { borderColor: 'var(--cn-edge)' } },
    }),
    Menu: Menu.extend({
      defaultProps: { radius: 'md', shadow: 'md' },
      styles: {
        dropdown: { backgroundColor: 'var(--cn-paper)', borderColor: 'var(--cn-edge)' },
        item: { fontFamily: fontTokens.sans, fontSize: '14.5px' },
        label: uppercaseLabel,
      },
    }),
  },
})
