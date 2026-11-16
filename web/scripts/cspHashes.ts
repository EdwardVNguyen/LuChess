import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

// Prints the Content-Security-Policy source for every inline script in a
// built index.html, e.g. 'sha256-…' 'sha256-…'. The image build (Dockerfile)
// hands them to Caddy, so the policy always matches the scripts the build
// really wrote: today the theme script vite.config.ts adds, and whatever a
// later change adds or edits.
//
//   node scripts/cspHashes.ts dist/index.html

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/cspHashes.ts <index.html>')
  process.exit(1)
}

// Browsers hash a script's text after turning CRLF into LF, so do the same.
const html = readFileSync(file, 'utf8').replace(/\r\n?/g, '\n')

const sources: string[] = []
for (const [, attrs, text] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  // A script with a src is covered by 'self', and its text is never run.
  if (/\bsrc\s*=/i.test(attrs)) continue
  sources.push(`'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`)
}

console.log(sources.join(' '))
