import { useEffect } from 'react'

/**
 * While `when` is true, closing or reloading the tab asks first, with the
 * browser's own prompt (#120). The listener is there only then: one left on
 * can keep the browser from using its back/forward cache.
 */
export function useWarnBeforeUnload(when: boolean) {
  useEffect(() => {
    if (!when) return
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      // Older browsers ask only when this is set.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [when])
}
