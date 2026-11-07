import { useMatches } from '@mantine/core'

export type OverlaySize = 'mobile' | 'tablet' | 'desktop'

// One component picks its own shape at each size (design/README.md,
// "Popovers and dialogs ... are centered dialogs on tablet and bottom sheets
// on mobile"), instead of three separate components. `sm`/`md` are the
// theme's breakpoints (web/src/theme/tokens.ts), chosen so 390/834/1440 land
// in different bands.
export function useOverlaySize(): OverlaySize {
  return useMatches({ base: 'mobile', sm: 'tablet', md: 'desktop' })
}
