# Car Rental Copilot (Master Edition)

An internal ChatGPT-like web app for a car rental company, built with enterprise controls.
Hosted entirely on Cloudflare free tier (Pages, Workers, D1).

## Master Upgrades
- **FREE-Only Model Router**: Intelligently routes inference to Hugging Face Free endpoints with strict verification.
  - Automatically verifies models use `Apache-2.0` or `MIT` licenses via Hugging Face API.
  - Denies configuration of `jailbreak`, `nsfw`, or otherwise unrestricted prompt models.
  - Uses an auto-fallback circuit breaker: if a model hits rate limits or times out (8s), it falls back to the next available.
  - If all fail, automatically cascades to **No-AI Deterministic Mode** (returns KB citations + exact tool cards).
- **Productivity UI**:
  - `Cmd+K` Command Palette for quick navigation and quote generation.
  - Native Markdown parsing (`react-markdown`) with chat copy buttons.
  - Inline Agent Macro picker to quickly summon SOP responses.
- **Security**: Hardened RBAC, comprehensive audit logging (with correlation IDs), optional Cloudflare Access support, and IP/session rate limits.
- **Tool Cards**: The chat securely renders rich HTML UI cards for "Quotes" and "Bookings" purely from the deterministic engine, avoiding hallucinated answers entirely.

## Prerequisites
- [GitHub CLI](https://cli.github.com/) (`gh`)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`wrangler`)
- [Node.js](https://nodejs.org/) & npm

## Deployment Instructions

Run these exact commands in your terminal to deploy the application from scratch to Cloudflare.

### 1. Authenticate

```bash
gh auth login
wrangler login
```

### 2. Setup Database (Cloudflare D1)

Create the D1 database:

```bash
wrangler d1 create car-rental-db
```

*Note the `database_id` output by the command above.*

Update the `apps/worker/wrangler.toml` file with your new `database_id`.

Apply migrations to your local and remote databases:

```bash
# Apply remotely (production)
cd apps/worker
wrangler d1 migrations apply car-rental-db --remote

# Optional: Seed data for testing
wrangler d1 execute car-rental-db --remote --file=scripts/seed.sql
cd ../..
```

### 3. Deploy Backend (Cloudflare Worker)

```bash
cd apps/worker
npm install
npm run deploy
cd ../..
```

*Note the deployed Worker URL (e.g., `https://car-rental-api.<your-subdomain>.workers.dev`).*

### 4. Deploy Frontend (Cloudflare Pages)

First, create the Pages project:

```bash
wrangler pages project create car-rental-copilot --production-branch main
```

Set the API URL for the frontend. In `apps/web/.env.production` (create it if it doesn't exist):

```env
VITE_API_URL=https://car-rental-api.<your-subdomain>.workers.dev
```

Build and deploy the frontend:

```bash
cd apps/web
npm install
npm run build
wrangler pages deploy dist --project-name car-rental-copilot
cd ../..
```

### 5. Set up Secrets

Store secrets securely via Wrangler:

```bash
# Required
wrangler secret put SESSION_SECRET --name car-rental-api

# Optional: Hugging Face Token (to increase FREE limits)
wrangler secret put HF_TOKEN --name car-rental-api

# Optional: Cloudflare Access (Zero Trust)
wrangler secret put ENABLE_CF_ACCESS --name car-rental-api # set to 'true'
wrangler secret put CF_ACCESS_JWKS_URL --name car-rental-api
wrangler secret put CF_ACCESS_AUD --name car-rental-api
wrangler secret put ADMIN_ALLOWLIST_EMAILS --name car-rental-api # e.g. admin@example.com
```

### 6. CI/CD Pipeline (GitHub Actions)

Enable automatic deployments and test runs on push to `main`:

1. Get your Cloudflare API Token (Edit Cloudflare Workers template).
2. Get your Cloudflare Account ID.
3. Add them as secrets to your GitHub repository:

```bash
gh secret set CLOUDFLARE_API_TOKEN
gh secret set CLOUDFLARE_ACCOUNT_ID
```

## Testing & Features Demo

Run unit tests locally using vitest:

```bash
cd apps/worker
npm run test
```

- **Try No-AI Mode**: Delete or disable all models in the Admin Model Registry. Type "quote" in the chat interface to see the deterministic tool engine kick in.
- **Try Command Palette**: Hit `Cmd+K` anywhere in the app to open the quick-action menu.
- **Try Macros**: In the chat box, click the folder icon to insert SOP templates.