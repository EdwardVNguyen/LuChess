import { Loader } from '@mantine/core'
import { Navigate } from '@tanstack/react-router'
import { LandingPage } from './landing/LandingPage'
import noteStyles from './notes/Notes.module.css'
import { useSession } from './session'

// `/`: the landing page for a Guest; someone logged in goes straight to their notes.
export function HomePage() {
  const { state } = useSession()

  if (state.status === 'restoring') {
    return (
      <div className={noteStyles.centered}>
        <Loader aria-label="Loading" />
      </div>
    )
  }
  // Not yet known to be a Guest (GLOSSARY.md); the shell shows the error with a Retry button.
  if (state.status === 'restore-failed') return null
  if (state.status === 'guest') return <LandingPage />
  return <Navigate to="/notes" replace />
}
