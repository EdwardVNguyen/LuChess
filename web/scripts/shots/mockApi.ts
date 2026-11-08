import type { Page } from 'playwright'
import type { FixtureSet } from './entries.js'
import { loggedInSession } from './fixtures.js'

// Never reached over the network: every request to it is intercepted below.
// Vite still requires VITE_API_URL to be a well-formed http(s) URL.
export const API_BASE_URL = 'http://shots.invalid'

// Mocks the whole API surface the frontend calls, so the harness never needs a
// real server or database. `fixtures` picks between a logged-out visitor and a
// signed-in session (mocked refresh and /me).
export async function installApiMocks(page: Page, fixtures: FixtureSet): Promise<void> {
  await page.route(`${API_BASE_URL}/**`, async (route) => {
    const request = route.request()
    const { pathname } = new URL(request.url())
    const method = request.method()
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

    if (pathname === '/api/health' && method === 'GET') return json(200, { status: 'ok' })

    if (pathname === '/api/auth/refresh' && method === 'POST') {
      return fixtures === 'session' ? json(200, loggedInSession) : json(401, { error: 'No session' })
    }

    if (pathname === '/api/me' && method === 'GET') {
      return fixtures === 'session' ? json(200, loggedInSession.user) : json(401, { error: 'Not signed in' })
    }

    if (pathname === '/api/auth/signup' && method === 'POST') {
      const body = request.postDataJSON() as { email: string; name: string }
      return json(200, { id: 99, email: body.email, name: body.name })
    }

    if (pathname === '/api/auth/resend-verification' && method === 'POST') {
      return json(200, { message: 'A new link is on its way.' })
    }

    if (pathname === '/api/auth/forgot-password' && method === 'POST') {
      return json(200, { message: 'If that email belongs to an account, we have sent a link to reset its password.' })
    }

    if (pathname === '/api/auth/reset-password' && method === 'POST') {
      const body = request.postDataJSON() as { token: string }
      return body.token === 'expired'
        ? json(400, { error: 'This reset link is invalid or has expired' })
        : json(200, {})
    }

    if (pathname === '/api/auth/verify-email' && method === 'POST') return json(200, {})
    if (pathname === '/api/auth/login' && method === 'POST') return json(200, loggedInSession)
    if (pathname === '/api/auth/logout' && method === 'POST') return json(200, {})

    return json(404, { error: `Not mocked for the screenshot harness: ${method} ${pathname}` })
  })
}
