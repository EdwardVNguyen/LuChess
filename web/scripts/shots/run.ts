import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { createServer } from 'vite'
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

  const server = await createServer({
    root: webRoot,
    configFile: path.join(webRoot, 'vite.config.ts'),
    server: { port: 0, strictPort: false },
    logLevel: 'warn',
  })
  await server.listen()
  const baseUrl = server.resolvedUrls?.local[0]
  if (!baseUrl) throw new Error('Vite dev server did not report a URL to screenshot')

  const browser = await chromium.launch()
  try {
    for (const entry of selected) {
      console.log(`Shooting ${entry.name}...`)
      for (const size of sizes) {
        await shootOne(browser, baseUrl, entry, size)
      }
    }
  } finally {
    await browser.close()
    await server.close()
  }
}

async function shootOne(browser: Browser, baseUrl: string, entry: ShotEntry, size: (typeof sizes)[number]) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    reducedMotion: 'reduce',
  })
  const page = await context.newPage()
  try {
    await installApiMocks(page, entry.fixtures, entry.notes, entry.search, entry.plies, entry.links)
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
