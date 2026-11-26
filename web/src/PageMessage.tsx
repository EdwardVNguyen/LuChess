import { Button, Group, Stack, Text, Title } from '@mantine/core'
import { Link, useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { useEffect, type ReactNode } from 'react'
import styles from './PageMessage.module.css'
import { useSession } from './session'

// The router's fallbacks (router.tsx), rendered inside the shell: a page that
// doesn't exist, and a failure nothing else caught. Same look as Note not found.
function PageMessage({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <div className={styles.centered}>
      <Stack align="center" gap="md" maw={380} ta="center">
        <Title order={2}>{title}</Title>
        <Text>{text}</Text>
        {children}
      </Stack>
    </div>
  )
}

// An unknown path. Someone logged in goes back to their notes; anyone else,
// including while the Session is still being restored, to the home page,
// which sends someone logged in on to their notes.
export function NotFoundPage() {
  const { state } = useSession()
  const authenticated = state.status === 'authenticated'

  return (
    <PageMessage title="Page not found" text="This page doesn't exist, or its address has changed.">
      <Button component={Link} to={authenticated ? '/notes' : '/'} variant="outline">
        {authenticated ? 'Back to your notes' : 'Go to the home page'}
      </Button>
    </PageMessage>
  )
}

// A page that threw while loading or rendering, e.g. its chunk is gone after a
// redeploy. The error is logged, never shown: it may be a raw message or a
// schema mismatch. Reloading is what fetches a redeploy's new chunks.
export function ErrorPage({ error, reset }: ErrorComponentProps) {
  const router = useRouter()

  useEffect(() => {
    console.error(error)
  }, [error])

  function tryAgain() {
    reset()
    void router.invalidate()
  }

  return (
    <PageMessage title="Something went wrong" text="This page hit an unexpected problem. Your saved notes are safe.">
      <Group justify="center" gap="sm">
        <Button variant="outline" onClick={tryAgain}>
          Try again
        </Button>
        <Button variant="subtle" onClick={() => window.location.reload()}>
          Reload the page
        </Button>
      </Group>
    </PageMessage>
  )
}
