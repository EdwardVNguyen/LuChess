// Dev-only (`/dev/error`): throws while rendering, to show the router's error
// page (PageMessage.tsx), so it can be screenshotted (#122).
export function DevError(): never {
  throw new Error('Thrown by /dev/error on purpose')
}
