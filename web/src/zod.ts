import { z } from 'zod'

// The app imports Zod from here, never from 'zod' itself (.oxlintrc.json).
//
// Zod speeds up parsing by compiling code with new Function, after first
// trying it once, when the first object schema is built, to see whether eval
// is allowed. The site's Content-Security-Policy forbids eval (web/Caddyfile),
// and the browser reports that try as a violation even though Zod catches it.
// Turning it off must happen before any schema is built, and only being a
// dependency of every module that builds one guarantees that: the build
// splits the app into chunks, which can run before main.tsx's own imports.
z.config({ jitless: true })

export { z }
