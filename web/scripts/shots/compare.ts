import { readFile } from 'node:fs/promises'
import type { Browser } from 'playwright'

// Renders the design PNG and the built PNG side by side, by screenshotting a
// small HTML page that holds both images. One file then shows the comparison.
export async function writeComparison(
  browser: Browser,
  designPath: string,
  builtPath: string,
  outPath: string,
): Promise<void> {
  const [designUri, builtUri] = await Promise.all([toDataUri(designPath), toDataUri(builtPath)])

  const page = await browser.newPage()
  try {
    await page.setContent(`<!doctype html>
<html>
  <head>
    <style>
      body { margin: 0; background: #fff; font-family: sans-serif; }
      .row { display: flex; align-items: flex-start; }
      .col { position: relative; border-right: 1px solid #ccc; }
      .col:last-child { border-right: none; }
      .label {
        position: absolute; top: 8px; left: 8px; padding: 2px 8px; border-radius: 4px;
        background: rgba(0, 0, 0, 0.7); color: #fff; font-size: 12px; letter-spacing: 0.02em;
      }
      img { display: block; }
    </style>
  </head>
  <body>
    <div class="row">
      <div class="col"><span class="label">design</span><img src="${designUri}" /></div>
      <div class="col"><span class="label">build</span><img src="${builtUri}" /></div>
    </div>
  </body>
</html>`)
    await page.screenshot({ path: outPath, fullPage: true })
  } finally {
    await page.close()
  }
}

async function toDataUri(path: string): Promise<string> {
  const buffer = await readFile(path)
  return `data:image/png;base64,${buffer.toString('base64')}`
}
