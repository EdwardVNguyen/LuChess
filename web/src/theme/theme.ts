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
  Textarea,
  TextInput,
  virtualColor,
} from '@mantine/core'
import { accent, ink } from './colors'
import { breakpointTokens, colorTokens, fontTokens, radiusTokens } from './tokens'

// The small uppercase, letter-spaced labels used throughout the designs
// (e.g. "FOLDER NAME", "WHO CAN SEE IT").
const uppercaseLabel = {
  fontFamily: fontTokens.sans,
  fontSize: '12px',
  fontWeight: 600,
  letterSpacing: '.09em',
  textTransform: 'uppercase' as const,
  color: colorTokens.muted,
}

export const theme = createTheme({
  fontFamily: fontTokens.serif,
  fontFamilyMonospace: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  primaryColor: 'ink',
  primaryShade: { light: 8, dark: 8 },
  autoContrast: true,
  defaultRadius: 'sm',
  cursorType: 'pointer',
  colors: {
    ink,
    accent,
    // `error`/`red` is used by form validation; map it onto the oxblood
    // accent so errors stay in the house palette instead of Mantine's red.
    red: virtualColor({ name: 'red', dark: 'accent', light: 'accent' }),
  },
  radius: radiusTokens,
  breakpoints: breakpointTokens,
  headings: {
    fontFamily: fontTokens.serif,
    fontWeight: '500',
    textWrap: 'balance',
    sizes: {
      h1: { fontSize: '34px', lineHeight: '1.2', fontWeight: '500' },
      h2: { fontSize: '28px', lineHeight: '1.25', fontWeight: '500' },
      h3: { fontSize: '21px', lineHeight: '1.3', fontWeight: '500' },
      h4: { fontSize: '19px', lineHeight: '1.35', fontWeight: '500' },
      h5: { fontSize: '17px', lineHeight: '1.4', fontWeight: '500' },
      h6: { fontSize: '15px', lineHeight: '1.4', fontWeight: '500' },
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
          return { root: { '--button-bd': `1px solid ${colorTokens.edge}`, '--button-color': colorTokens.ink } }
        }
        return { root: {} }
      },
    }),
    TextInput: TextInput.extend({
      defaultProps: { radius: 'sm' },
      styles: { input: { fontFamily: fontTokens.serif, fontSize: '16px' } },
    }),
    PasswordInput: PasswordInput.extend({
      defaultProps: { radius: 'sm' },
      styles: { input: { fontFamily: fontTokens.serif, fontSize: '16px' } },
    }),
    Textarea: Textarea.extend({
      defaultProps: { radius: 'sm' },
      styles: { input: { fontFamily: fontTokens.serif, fontSize: '16px' } },
    }),
    Input: Input.extend({
      styles: { input: { borderColor: colorTokens.edge, backgroundColor: colorTokens.card } },
    }),
    InputWrapper: InputWrapper.extend({
      styles: { label: uppercaseLabel, description: { fontFamily: fontTokens.sans } },
    }),
    Card: Card.extend({
      defaultProps: { radius: 'md', withBorder: true, padding: 'lg' },
      styles: { root: { backgroundColor: colorTokens.card, borderColor: colorTokens.edge } },
    }),
    Modal: Modal.extend({
      defaultProps: { radius: 'lg', centered: true, overlayProps: { color: colorTokens.ink, backgroundOpacity: 0.45 } },
      styles: {
        content: { backgroundColor: colorTokens.paper },
        title: { fontFamily: fontTokens.serif, fontSize: '28px', fontWeight: 500 },
      },
    }),
    Drawer: Drawer.extend({
      defaultProps: { radius: 'lg', overlayProps: { color: colorTokens.ink, backgroundOpacity: 0.45 } },
      styles: {
        content: { backgroundColor: colorTokens.paper },
        title: { fontFamily: fontTokens.serif, fontSize: '28px', fontWeight: 500 },
      },
    }),
    Popover: Popover.extend({
      defaultProps: { radius: 'md', shadow: 'md' },
      styles: { dropdown: { backgroundColor: colorTokens.paper, borderColor: colorTokens.edge } },
    }),
    Radio: Radio.extend({
      styles: { label: { fontFamily: fontTokens.sans, fontSize: '15px' }, radio: { borderColor: colorTokens.edge } },
    }),
    Menu: Menu.extend({
      defaultProps: { radius: 'md', shadow: 'md' },
      styles: {
        dropdown: { backgroundColor: colorTokens.paper, borderColor: colorTokens.edge },
        item: { fontFamily: fontTokens.sans, fontSize: '14.5px' },
        label: uppercaseLabel,
      },
    }),
  },
})
