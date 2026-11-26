// Whether closing the tab now would ask first (#120): a page asks by
// cancelling beforeunload.
export function leavingAsks() {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}
