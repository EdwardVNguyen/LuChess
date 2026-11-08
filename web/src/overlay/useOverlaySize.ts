import { useMatches } from '@mantine/core'

export type OverlaySize = 'mobile' | 'tablet' | 'desktop'

// The composition point reads the environment once and passes the result to
// the overlay components. They take size as a prop instead of calling this
// themselves, so every shape is reachable in tests without mocking matchMedia.
//
// `sm`/`md` are the theme's breakpoints (web/src/theme/tokens.ts), chosen so
// 390/834/1440 land in different bands.
export function useOverlaySize(): OverlaySize {
  return useMatches({ base: 'mobile', sm: 'tablet', md: 'desktop' })
}
