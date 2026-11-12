import '@mantine/core/styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { api } from './apiClient'
import { router } from './router'
import { createSession, SessionProvider } from './session'
import { ThemeProvider } from './theme'

const queryClient = new QueryClient()
const session = createSession({
  transport: api,
  // Session-scoped data must not survive the end of the Session, whether that
  // is a logout or a refresh refused with 401.
  onSessionEnded: () => queryClient.clear(),
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider session={session}>
          <RouterProvider router={router} />
        </SessionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
