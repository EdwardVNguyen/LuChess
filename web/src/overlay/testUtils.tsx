import { createTheme, MantineProvider, mergeThemeOverrides, Popover } from '@mantine/core'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { theme } from '../theme'

// Not env="test", which skips the exit transitions whose end returns focus
// (testSetup.ts). But env="test" also stops a Popover hiding when floating-ui
// reports its trigger out of view, which jsdom, with no layout, does once the
// position is first worked out, a moment after the Popover opens. Without
// this, a findBy* for the Popover passes or fails on how soon it looks.
const testTheme = mergeThemeOverrides(
  theme,
  createTheme({ components: { Popover: Popover.extend({ defaultProps: { hideDetached: false } }) } }),
)

export function renderWithTheme(ui: ReactElement) {
  return render(<MantineProvider theme={testTheme}>{ui}</MantineProvider>)
}
