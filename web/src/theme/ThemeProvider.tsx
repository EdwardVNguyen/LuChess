import { MantineProvider } from '@mantine/core'
import type { ReactNode } from 'react'
import { cssVariablesResolver } from './cssVariablesResolver'
import { theme } from './theme'
import { useTheme } from './themeChoice'
import { palettes } from './tokens'

// Mantine with the app's theme. The colours are CSS variables set per theme
// (themeCss.ts); Mantine only needs to know whether the current theme is
// light or dark.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { theme: current } = useTheme()
  return (
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} forceColorScheme={palettes[current].scheme}>
      {children}
    </MantineProvider>
  )
}
