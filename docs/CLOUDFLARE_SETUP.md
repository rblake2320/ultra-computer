# Cloudflare Setup — ultra-computer

## What this gives you

- **Public HTTPS endpoint** — no open inbound ports on your server
- **SSL/TLS** — Cloudflare terminates TLS, auto-renewing cert
- **DDoS protection** — absorbs Layer 3/4/7 attacks
- **WAF** — blocks OWASP top-10 before they reach your server
- **CDN** — static JS/CSS bundles cached at Cloudflare edge
- **Zero inbound ports** — cloudflared punches out to Cloudflare, firewall stays closed
- **Temporal and Redis stay internal** — only port 5000 is exposed through the tunnel

## Architecture

```
Browser / API clients
        │
        ▼
Cloudflare Edge (your domain)
  • SSL termination
  • WAF / DDoS
  • CDN cache
        │  Cloudflare Tunnel (encrypted, outbound-only)
        ▼
cloudflared container (in docker-compose stack)
        │  http://app:5000 (internal Docker network)
        ▼
app container (Node.js + Express on port 5000)
        │
        ├── redis (internal)
        ├── temporal (internal, port 7233 NOT exposed)
        └── temporal-postgres (internal)
```

## One-time setup (5 minutes)

### Step 1 — Create the tunnel in Cloudflare Dashboard

1. Go to https://one.dash.cloudflare.com
2. Select your account → **Zero Trust** → **Networks** → **Tunnels**
3. Click **Create a tunnel**
4. Connector type: **Cloudflared**
5. Tunnel name: `ultra-computer`
6. Click **Save tunnel**
7. Copy the **tunnel token** shown (starts with `eyJ...`)

### Step 2 — Configure the public hostname

Still in the tunnel setup wizard:

1. Click **Add a public hostname**
2. Fill in:
   - **Subdomain**: your chosen subdomain (e.g. `ultra`, `computer`, etc.)
   - **Domain**: your chosen domain from your Cloudflare account
   - **Path**: *(leave blank)*
   - **Service type**: `HTTP`
   - **URL**: `app:5000`
3. Click **Save hostname**

Cloudflare automatically creates the DNS CNAME record pointing to the tunnel.

### Step 3 — Add the token to .env

```bash
# .env (at ultra-computer repo root)
TUNNEL_TOKEN=eyJ...your-token-here...
```

### Step 4 — Start the stack with tunnel

```bash
docker compose --profile tunnel up -d
```

Or add to a running stack:
```bash
docker compose --profile tunnel up -d cloudflared
```

### Step 5 — Verify

```bash
# Check tunnel is connected
docker compose logs cloudflared

# Confirm the app is reachable through Cloudflare
curl -H "Authorization: Bearer $ULTRA_API_KEY" https://your-domain/api/health
```

Expected: `{"status":"ok",...}`

## Running without the tunnel (local dev)

The `cloudflared` service uses the `tunnel` compose profile — it does **not** start by default:

```bash
docker compose up -d                     # local only, no tunnel
docker compose --profile tunnel up -d    # with Cloudflare tunnel
```

## Temporal UI — stays internal

The Temporal UI (port 8080) is intentionally NOT exposed through Cloudflare.
Access it locally at http://localhost:8080 only.

If you need remote access, add a second public hostname to the same tunnel:
- Subdomain/Domain: your choice
- Service: `http://temporal-ui:8080`
- Then gate it with a Cloudflare Access policy (email allowlist).

## Cloudflare Access (optional — adds login gate)

1. Zero Trust → Access → Applications → Add an application
2. Type: **Self-hosted**
3. App domain: your public hostname
4. Policy: Email → your email

This adds JWT-verified login before any request reaches the server.

## Security posture after tunnel is active

| Layer | What it blocks |
|---|---|
| Cloudflare edge | DDoS, bot traffic, known malicious IPs |
| WAF (free tier) | OWASP Top 10, auto-managed CVE rules |
| Tunnel encryption | All traffic encrypted between cloudflared and Cloudflare edge |
| App rate limiting | `express-rate-limit` on all API routes |
| Policy control plane | `governedFetch()` for all outbound HTTP from the app |
| Auth | `ULTRA_API_KEY` bearer token on all API routes |
