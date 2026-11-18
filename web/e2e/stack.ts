import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createWriteStream, rmSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { build, preview, type PreviewServer } from 'vite'
import { API_LOG_ENV, BASE_URL_ENV } from './env.js'

// Starts everything the browser test runs against (#43): the compose Postgres,
// a fresh chessnotes_e2e database, the real API and a production build of the
// app. Playwright runs this as its global setup and the function it returns as
// the teardown, which also runs after a failure or Ctrl-C.

const run = promisify(execFile)

const webRoot = path.resolve(import.meta.dirname, '..')
const apiRoot = path.resolve(webRoot, '../api')
const compose = ['compose', '-f', path.join(apiRoot, 'docker-compose.yml')]

// The compose Postgres (api/docker-compose.yml). Only this database is
// touched; the dev chessnotes one never is.
const database = 'chessnotes_e2e'
const databaseUrl = `postgres://postgres:postgres@127.0.0.1:5433/${database}?sslmode=disable`

export default async function setup() {
  const workDir = await mkdtemp(path.join(tmpdir(), 'chessnotes-e2e-'))
  let api: ChildProcess | undefined
  let server: PreviewServer | undefined

  // If the runner exits without a teardown, as on Ctrl-C during this setup,
  // the API still stops and the builds are still removed.
  const onExit = () => {
    api?.kill('SIGTERM')
    rmSync(workDir, { recursive: true, force: true })
  }
  process.once('exit', onExit)

  async function teardown() {
    process.off('exit', onExit)
    await server?.close()
    await stop(api)
    await rm(workDir, { recursive: true, force: true })
  }

  try {
    // Ports first: the API's URL is baked into the build, and the API only
    // allows the app's origin.
    const [apiPort, webPort] = await Promise.all([freePort(), freePort()])
    const apiUrl = `http://localhost:${apiPort}`
    const webUrl = `http://localhost:${webPort}`

    console.log('Starting Postgres...')
    await run('docker', [...compose, 'up', '-d', '--wait', 'db'])
    // Dropped and made again on every run, and kept afterwards so a failure can
    // be looked into. The API's migrations build the schema.
    await run('docker', [
      ...compose, 'exec', '-T', 'db', 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1',
      '-c', `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`,
      '-c', `CREATE DATABASE ${database}`,
    ])

    console.log('Building the API...')
    const binary = path.join(workDir, 'api')
    await run('go', ['build', '-o', binary, '.'], { cwd: apiRoot })

    const logPath = path.join(workDir, 'api.log')
    api = startApi(binary, workDir, logPath, {
      PORT: String(apiPort),
      DB_URL: databaseUrl,
      FRONTEND_ORIGIN: webUrl,
      JWT_SECRET: randomBytes(48).toString('base64'),
      // Prints each email to stdout, where the test finds the verification link
      MAILER: 'console',
      COOKIE_SECURE: 'true',
      TRUST_PROXY_HEADERS: 'false',
    })

    console.log('Building the app...')
    process.env.VITE_API_URL = apiUrl
    // Never send this test's events to PostHog, even with a key in .env.local
    process.env.VITE_POSTHOG_KEY = ''
    const viteConfig = {
      root: webRoot,
      configFile: path.join(webRoot, 'vite.config.ts'),
      logLevel: 'warn',
      build: { outDir: path.join(workDir, 'dist'), emptyOutDir: true, chunkSizeWarningLimit: Infinity },
    } as const
    await build(viteConfig)
    server = await preview({ ...viteConfig, preview: { host: 'localhost', port: webPort, strictPort: true } })

    await waitForApi(api, logPath)

    process.env[API_LOG_ENV] = logPath
    process.env[BASE_URL_ENV] = webUrl
    return teardown
  } catch (error) {
    await teardown()
    throw error
  }
}

/**
 * Runs the built API from workDir, so it never loads api/.env, with only the
 * settings given: nothing else from this shell (SMTP, PG*, proxy settings)
 * leaks in.
 */
function startApi(binary: string, workDir: string, logPath: string, settings: Record<string, string>): ChildProcess {
  const log = createWriteStream(logPath)
  const api = spawn(binary, [], { cwd: workDir, env: { PATH: process.env.PATH, ...settings } })
  api.stdout?.pipe(log)
  api.stderr?.pipe(log)
  return api
}

/** Waits until the API has migrated its database and is listening, or fails with its log. */
async function waitForApi(api: ChildProcess, logPath: string) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const log = await readFile(logPath, 'utf8')
    if (log.includes('Server running on port')) return
    if (api.exitCode !== null) throw new Error(`The API exited with code ${api.exitCode}:\n${log}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`The API did not start within 30s:\n${await readFile(logPath, 'utf8')}`)
}

async function stop(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise((resolve) => child.once('exit', resolve))
  child.kill('SIGTERM')
  await exited
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, 'localhost', () => {
      const address = probe.address()
      probe.close(() => (typeof address === 'object' && address ? resolve(address.port) : reject(new Error('No free port'))))
    })
  })
}
