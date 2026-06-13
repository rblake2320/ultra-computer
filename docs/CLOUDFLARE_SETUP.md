# Cloudflare Tunnel Setup — ultra-computer

Exposes the app publicly via a Cloudflare Tunnel — no open inbound ports required.
Your server makes an outbound-only connection to Cloudflare's edge; Cloudflare handles
SSL, DDoS protection, WAF, and routing.

## Architecture

```
Browser / API clients
        │
        ▼
Cloudflare Edge (your zone)
  • SSL/TLS (auto cert)
  • DDoS + WAF
  • CDN (static assets cached at edge)
        │
        │  Cloudflare Tunnel (encrypted, outbound-only from your server)
        │  CNAME: your-subdomain.your-domain.com → <tunnel-id>.cfargotunnel.com
        ▼
cloudflared container (docker-compose tunnel profile)
        │  routes to → http://app:5000 (internal Docker network)
        ▼
app container — Node.js + Express port 5000
        ├── redis (internal only)
        ├── temporal + temporal-postgres (internal only, port 7233 never exposed)
        └── SQLite data volume (internal only)
```

## One-time setup (5 minutes)

### Step 1 — Create the tunnel

1. Go to https://one.dash.cloudflare.com
2. **Zero Trust → Networks → Tunnels → Create a tunnel**
3. Connector: **Cloudflared**
4. Give it any name (e.g. `ultra-computer`)
5. Save → copy the **tunnel token** (starts with `eyJ...`)

### Step 2 — Add the public hostname

Still in the tunnel wizard (or edit tunnel → Public Hostnames tab):

| Field | Value |
|-------|-------|
| Subdomain | `your-subdomain` |
| Domain | `your-domain.com` |
| Path | *(leave blank)* |
| Service type | `HTTP` |
| URL | `app:5000` |

Click **Save**. Cloudflare automatically creates:
```
your-subdomain.your-domain.com  CNAME  <tunnel-id>.cfargotunnel.com  [Proxied]
```

### Step 3 — Add token to .env

```bash
# .env
TUNNEL_TOKEN=eyJ...your-token-here...
```

### Step 4 — Start with tunnel

```bash
docker compose --profile tunnel up -d
```

Confirm it connected:
```bash
docker compose logs -f cloudflared
# Should show: "Registered tunnel connection"
```

### Step 5 — Verify live

```bash
curl https://your-subdomain.your-domain.com/api/health
# {"status":"ok",...}
```

---

## Default vs tunnel profiles

The `cloudflared` service is **off by default** — it uses the `tunnel` compose profile:

```bash
docker compose up -d                    # local stack only, no tunnel
docker compose --profile tunnel up -d   # local stack + Cloudflare tunnel
```

The rest of the stack (Redis, Temporal, app) is unaffected either way.

---

## Swapping to a different domain later

Zero downtime. Three steps:

**1. Create a new tunnel for the new domain**
- Zero Trust → Tunnels → Create tunnel
- Add public hostname: `<subdomain>.<new-domain>` → `http://app:5000`
- Copy the new tunnel token

**2. Swap the token in .env and restart cloudflared**
```bash
# .env
TUNNEL_TOKEN=eyJ...new-token...

docker compose --profile tunnel restart cloudflared
```

**3. Delete the old public hostname from the old tunnel**
- Cloudflare Dashboard → old tunnel → Public Hostnames → remove it
- Or delete the tunnel entirely if no longer needed

The app itself never changes — only the tunnel token in `.env`.

---

## Cloudflare Access (optional login gate)

To require authentication before any request reaches the app:

1. Zero Trust → Access → Applications → Add
2. Type: **Self-hosted**
3. Domain: `your-subdomain.your-domain.com`
4. Policy: Email → `your-email@example.com` (or any identity provider)

Adds Cloudflare's JWT-verified login gate in front of the tunnel.

---

## Security layers active once tunnel is live

| Layer | Status |
|-------|--------|
| Cloudflare DDoS (L3/4/7) | Active |
| WAF — OWASP Top 10 | Active (free managed rules) |
| TLS 1.3 | Active (Cloudflare terminates) |
| Bot fight mode | Active |
| App rate limiting (`express-rate-limit`) | Active |
| Policy egress control (`governedFetch`) | Active |
| Bearer token auth (`ULTRA_API_KEY`) | Active when set in .env |
| Temporal/Redis/Postgres — internal only | Confirmed (no ports exposed externally) |
