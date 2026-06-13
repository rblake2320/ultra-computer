# Cloudflare Setup — ultra-computer

## Current: ultra-computer.ultrarag.app (temporary)

Using `ultra-computer.ultrarag.app` as a temporary home under the existing `ultrarag.app` zone.
This is clearly labeled and fully separable — see **Migration to own domain** below.

## Public URL

```
https://ultra-computer.ultrarag.app
```

## Architecture

```
Browser / API clients
        │
        ▼
Cloudflare Edge — ultrarag.app zone
  • SSL/TLS (auto cert)
  • DDoS + WAF
  • CDN (static assets cached at edge)
        │
        │  Cloudflare Tunnel (encrypted, outbound-only from your server)
        │  CNAME: ultra-computer.ultrarag.app → <tunnel-id>.cfargotunnel.com
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
4. Name: `ultra-computer`
5. Save → copy the **tunnel token** (starts with `eyJ...`)

### Step 2 — Add the public hostname

Still in the tunnel wizard (or edit tunnel → Public Hostnames tab):

| Field | Value |
|-------|-------|
| Subdomain | `ultra-computer` |
| Domain | `ultrarag.app` |
| Path | *(leave blank)* |
| Service type | `HTTP` |
| URL | `app:5000` |

Click **Save**. Cloudflare automatically creates:
```
ultra-computer.ultrarag.app  CNAME  <tunnel-id>.cfargotunnel.com  [Proxied]
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

Check it's connected:
```bash
docker compose logs -f cloudflared
# Should show: "Registered tunnel connection"
```

### Step 5 — Verify live

```bash
curl https://ultra-computer.ultrarag.app/api/health
# {"status":"ok",...}
```

---

## Migration to own domain (when ready)

Zero downtime. Three steps:

**1. Create a new tunnel for the new domain**
- Zero Trust → Tunnels → Create tunnel → name: `ultra-computer-prod`
- Add public hostname: `<subdomain>.<your-new-domain>` → `http://app:5000`
- Copy the new tunnel token

**2. Swap the token in .env and restart cloudflared**
```bash
# .env
TUNNEL_TOKEN=eyJ...new-token...

docker compose --profile tunnel restart cloudflared
```

**3. Delete the old CNAME from ultrarag.app**
- Cloudflare Dashboard → ultrarag.app → DNS → delete `ultra-computer` CNAME
- OR: edit the old tunnel → remove the `ultra-computer.ultrarag.app` public hostname

That's it. `ultrarag.app` is completely clean. The app itself never changes.

---

## What does NOT start by default

The `cloudflared` service uses the `tunnel` compose profile — it is **off by default**:

```bash
docker compose up -d                    # local stack only, no tunnel
docker compose --profile tunnel up -d   # local stack + Cloudflare tunnel
```

This means the existing `ultrarag.app` setup (api, army, memoryweb) is completely unaffected by this stack.

---

## Cloudflare Access (add login gate — optional)

To require login before any request reaches the app:

1. Zero Trust → Access → Applications → Add
2. Type: **Self-hosted**
3. Domain: `ultra-computer.ultrarag.app`
4. Policy: Email → `rob47595@gmail.com`

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
| Bearer token auth (`ULTRA_API_KEY`) | Active |
| Temporal/Redis/Postgres — internal only | Confirmed |
