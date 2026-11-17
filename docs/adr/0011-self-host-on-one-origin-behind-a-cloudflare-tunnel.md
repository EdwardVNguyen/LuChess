# Self-host on one origin behind a Cloudflare Tunnel

_Amended for containers (#136): each part runs in its own container from one Compose file (`deploy/compose.yaml`), and no container publishes a port. The visitor's address comes from `CF-Connecting-IP` when `TRUST_PROXY_HEADERS` is on. CI builds the images and publishes them to GHCR, and the Pi pulls them._

The plan (#14) put the frontend on Vercel and the API on Railway, on sibling subdomains. We decided instead to self-host on the owner's Raspberry Pi 5, and to serve the frontend and the API from one origin: the frontend at `/`, the API under `/api/`. Visitors reach the Pi through a Cloudflare Tunnel, and Caddy on the Pi serves the built frontend, falls back to `index.html` for the app's routes, and passes `/api/` to the API. This amends the deployment consequence in ADR 0004.

```
browser ──HTTPS──▶ Cloudflare ══tunnel══▶ cloudflared ──▶ web (Caddy) ──▶ the built frontend
                                                                    └──▶ /api/ → api ──▶ db (Postgres)
                                          (each a container on the Pi)
```

One origin means the browser never makes a cross-origin call in production: no CORS, and no preflight before the JSON writes and the requests carrying an access token, which are most of the API's. The refresh cookie is first-party with no cross-site question, and `FRONTEND_ORIGIN` and `VITE_API_URL` are the same URL. Hosting the two apart buys independent deploys and scaling, which a single Pi cannot use anyway.

## Considered options

- **Frontend and API on sibling subdomains**, as ADR 0004 assumed. Rejected: CORS to keep exact, a preflight on most requests, and a refresh cookie that works only while both share a registrable domain, for no benefit on one machine.
- **Forwarding ports 80 and 443 on the home router**, with dynamic DNS and Caddy's own certificates. Rejected for the tunnel: it opens no ports, hides the home IP address, and works behind carrier-grade NAT. The cost is that Cloudflare terminates HTTPS, so it can read the traffic.

## Consequences

- The frontend can never have a route under `/api/`, and the fallback to `index.html` must exclude `/api/`, or an unknown API path answers the app's HTML with 200.
- Cache and firewall rules at Cloudflare are scoped by path. A rule that caches everything would cache API responses, one user's Notes served to another, unless it excludes `/api/`.
- Anything else served from the origin is trusted by the API, so user-uploaded files or other apps go on another hostname.
- Every visitor arrives at the API from the web container. For the rate limits, the visitor's address comes from `CF-Connecting-IP` when `TRUST_PROXY_HEADERS` is on. That is safe only while nothing but the web container can reach the API.
- No container publishes a port, so the tunnel is the only way in. Each container shares a Docker network only with those it talks to: `cloudflared` reaches only `web`, and only the API reaches Postgres.
- CI builds the API and web images for arm64 and publishes them to GHCR, tagged with the commit's SHA. The Pi pulls them and builds nothing, and deploying or rolling back is a change of that one tag (docs/deploy.md).
- Development is still cross-origin (Vite on :5173, the API on :8080), so the API keeps its CORS allow-list for it. The CSRF guard on the refresh cookie works unchanged, since browsers send `Origin` on same-origin POSTs.
- ADR 0004's decisions about tokens, rotation and reuse do not depend on where the site is hosted, and stand.
