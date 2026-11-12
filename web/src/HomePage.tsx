import { Navigate } from '@tanstack/react-router'
import { LandingPage } from './landing/LandingPage'
import { PageLoading } from './Loading'
import { useSession } from './session'

// `/`: the landing page for a Guest; someone logged in goes straight to their notes.
export function HomePage() {
  const { state } = useSession()

  if (state.status === 'restoring') return <PageLoading />
  // Not yet known to be a Guest (GLOSSARY.md); the shell shows the error with a Retry button.
  if (state.status === 'restore-failed') return null
  if (state.status === 'guest') return <LandingPage />
  return <Navigate to="/notes" replace />
}
