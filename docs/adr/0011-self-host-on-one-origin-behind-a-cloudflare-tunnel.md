# Self-host on one origin behind a Cloudflare Tunnel

The plan (#14) put the frontend on Vercel and the API on Railway, on sibling subdomains. We decided instead to self-host on the owner's Raspberry Pi 5, and to serve the frontend and the API from one origin: the frontend at `/`, the API under `/api/`. Visitors reach the Pi through a Cloudflare Tunnel, and Caddy on the Pi serves the built frontend, falls back to `index.html` for the app's routes, and passes `/api/` to the API. This amends the deployment consequence in ADR 0004.

```
browser ──HTTPS──▶ Cloudflare ══tunnel══▶ cloudflared ──▶ Caddy ──▶ web/dist (the frontend)
                                          (on the Pi)          └──▶ /api/ → the API ──▶ Postgres
```

One origin means the browser never makes a cross-origin call in production: no CORS, and no preflight before the JSON writes and the requests carrying an access token, which are most of the API's. The refresh cookie is first-party with no cross-site question, and `FRONTEND_ORIGIN` and `VITE_API_URL` are the same URL. Hosting the two apart buys independent deploys and scaling, which a single Pi cannot use anyway.

## Considered options

- **Frontend and API on sibling subdomains**, as ADR 0004 assumed. Rejected: CORS to keep exact, a preflight on most requests, and a refresh cookie that works only while both share a registrable domain, for no benefit on one machine.
- **Forwarding ports 80 and 443 on the home router**, with dynamic DNS and Caddy's own certificates. Rejected for the tunnel: it opens no ports, hides the home IP address, and works behind carrier-grade NAT. The cost is that Cloudflare terminates HTTPS, so it can read the traffic.

## Consequences

- The frontend can never have a route under `/api/`, and the fallback to `index.html` must exclude `/api/`, or an unknown API path answers the app's HTML with 200.
- Cache and firewall rules at Cloudflare are scoped by path. A rule that caches everything would cache API responses, one user's Notes served to another, unless it excludes `/api/`.
- Anything else served from the origin is trusted by the API, so user-uploaded files or other apps go on another hostname.
- Every visitor arrives at the API from Caddy on loopback. Their address is in `CF-Connecting-IP`, trusted only from loopback, for the rate limits.
- Everything on the Pi (`cloudflared`, Caddy, the API, Postgres) listens on loopback, and the tunnel is the only way in.
- Development is still cross-origin (Vite on :5173, the API on :8080), so the API keeps its CORS allow-list for it. The CSRF guard on the refresh cookie works unchanged, since browsers send `Origin` on same-origin POSTs.
- ADR 0004's decisions about tokens, rotation and reuse do not depend on where the site is hosted, and stand.
