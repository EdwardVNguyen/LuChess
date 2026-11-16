# The frontend's image: Caddy serving the production build and passing /api/
# to the API (docs/adr/0011). Build it from this directory:
#
#   docker build -t luchess-web --build-arg VITE_API_URL=https://<the site> .

FROM node:24-alpine AS build
WORKDIR /app

# Dependencies first, so this layer is reused until the lockfile changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite fixes VITE_API_URL into the bundle, and the build itself passes without
# it: the app would only fail when it loads. So refuse here, by the app's own
# rule for the value (src/config.ts).
ARG VITE_API_URL
RUN if [ -z "$VITE_API_URL" ]; then \
      echo >&2 "VITE_API_URL is not set. Pass the site's own origin: --build-arg VITE_API_URL=https://<the site>"; \
      exit 1; \
    fi \
 && node -e "import('./src/config.ts').then((m) => m.loadConfig(process.env))"

# The Content-Security-Policy allows index.html's inline scripts by hash.
# Take the hashes from the file just built, never by hand, so a change to a
# script cannot leave the policy behind and break the page.
RUN npm run build \
 && hashes="$(node scripts/cspHashes.ts dist/index.html)" \
 && printf 'import frontend_headers "%s"\n' "$hashes" > frontend-headers.caddy


FROM caddy:2.11-alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/frontend-headers.caddy /etc/caddy/frontend-headers.caddy
COPY --from=build /app/dist /srv

# Fail the build, not the deploy, on a configuration Caddy cannot load.
RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

EXPOSE 80
