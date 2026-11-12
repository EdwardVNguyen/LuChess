import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { availableParallelism, tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'
import { build, preview, type InlineConfig, type PreviewServer } from 'vite'
import type { Browser } from 'playwright'
import { writeComparison } from './compare.js'
import { entries, type ShotEntry } from './entries.js'
import { API_BASE_URL, installApiMocks } from './mockApi.js'

const webRoot = path.resolve(import.meta.dirname, '../..')
const designDir = path.resolve(webRoot, '../design/screenshots')
const outDir = path.resolve(webRoot, 'shots')
const compareDir = path.join(outDir, 'compare')

// Named like the design files: a desktop viewport plus full-page tablet and
// mobile captures (design/README.md: "Tall screens are drawn at full page
// height").
const sizes = [
  { suffix: '', width: 1440, height: 1080 },
  { suffix: '-tablet', width: 834, height: 1080 },
  { suffix: '-mobile', width: 390, height: 844 },
]

async function main() {
  const only = process.argv[2]
  const selected = only ? entries.filter((entry: ShotEntry) => entry.name === only) : entries
  if (only && selected.length === 0) {
    console.error(`No entry named "${only}". Known entries: ${entries.map((e: ShotEntry) => e.name).join(', ')}`)
    process.exitCode = 1
    return
  }

  await mkdir(outDir, { recursive: true })
  await mkdir(compareDir, { recursive: true })

  // Points the app at a URL nothing is listening on: every request to it is
  // intercepted by installApiMocks, so no API or database needs to run.
  process.env.VITE_API_URL = API_BASE_URL

  // Shoots a production build: a few bundled files per page load instead of
  // hundreds of dev-server modules. The "shots" mode keeps the /dev routes,
  // which a plain `npm run build` leaves out (src/router.tsx).
  const buildDir = await mkdtemp(path.join(tmpdir(), 'chessnotes-shots-'))
  const viteConfig = {
    root: webRoot,
    configFile: path.join(webRoot, 'vite.config.ts'),
    mode: 'shots',
    logLevel: 'warn',
    build: { outDir: buildDir, emptyOutDir: true, chunkSizeWarningLimit: Infinity },
  } satisfies InlineConfig
  let server: PreviewServer | undefined
  try {
    await build(viteConfig)
    // Port 0: a free port, so this can run beside a dev server or another run.
    server = await preview({ ...viteConfig, preview: { port: 0, strictPort: false } })
    const baseUrl = server.resolvedUrls?.local[0]
    if (!baseUrl) throw new Error('Vite preview server did not report a URL to screenshot')
    await shootAll(selected, baseUrl)
  } finally {
    await server?.close()
    await rm(buildDir, { recursive: true, force: true })
  }
}

async function shootAll(selected: ShotEntry[], baseUrl: string) {
  // Each shot has its own browser context, so several run at once. Most of a
  // shot is waiting (for the network to go quiet, for fonts), which overlaps.
  const jobs = selected.flatMap((entry) => sizes.map((size) => ({ entry, size })))
  const concurrency = Math.max(1, Number(process.env.SHOTS_CONCURRENCY) || Math.min(8, Math.ceil(availableParallelism() / 2)))
  const browser = await chromium.launch()
  try {
    let next = 0
    async function worker() {
      while (next < jobs.length) {
        const { entry, size } = jobs[next++]
        if (size === sizes[0]) console.log(`Shooting ${entry.name}...`)
        await shootOne(browser, baseUrl, entry, size)
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker))
  } finally {
    await browser.close()
  }
}

async function shootOne(browser: Browser, baseUrl: string, entry: ShotEntry, size: (typeof sizes)[number]) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    reducedMotion: 'reduce',
  })
  const page = await context.newPage()
  try {
    await installApiMocks(page, entry.fixtures, entry.notes, entry.search, entry.moves, entry.links)
    if (entry.theme) {
      await page.addInitScript((theme) => window.localStorage.setItem('chessnotes:theme', theme), entry.theme)
    }
    await page.goto(`${baseUrl.replace(/\/$/, '')}${entry.route}`, { waitUntil: entry.waitUntil ?? 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    // Belt and braces on top of reducedMotion: stop anything still animating
    // (e.g. loaders) so repeated runs produce identical pixels.
    await page.addStyleTag({
      content: `*, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }`,
    })
    await entry.setup?.(page)
    // react-chessboard animates moves in JavaScript, which the style above
    // cannot stop: let a jump between positions finish before the capture.
    await page.waitForTimeout(400)

    const fileName = `${entry.name}${size.suffix}.png`
    await page.screenshot({ path: path.join(outDir, fileName), fullPage: true })

    const designPath = path.join(designDir, fileName)
    if (existsSync(designPath)) {
      await writeComparison(browser, designPath, path.join(outDir, fileName), path.join(compareDir, fileName))
    }
  } finally {
    await context.close()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
