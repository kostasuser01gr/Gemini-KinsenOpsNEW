# Car Rental Ops Copilot (Knowledge & SOP Edition)

An internal ChatGPT-like web app for a car rental company, built for policy search and operational support.
Hosted entirely on Cloudflare free tier (Pages, Workers, D1).

## Core Upgrades (v3)
- **NO Pricing/Booking**: Completely removed reservation and pricing logic to focus on Knowledge Base and SOP support.
- **FREE-Only Model Router**: Intelligently routes inference to verified FREE providers.
  - **Hugging Face Routed Free**: Auto-verifies `Apache-2.0` or `MIT` licenses.
  - **Cloudflare Workers AI**: Uses the free daily allocation of 10k neurons.
  - **Auto-Fallback**: If a model fails or hits limits, the system tries the next one in the chain.
  - **No-AI Mode**: If all models are unavailable, the system falls back to a deterministic KB snippet + citation mode.
- **Advanced Knowledge Base**:
  - Full-text search (FTS5) with role-based visibility.
  - Citation engine: answers always point to the specific document and snippet used.
- **Enterprise Controls**:
  - Hardened RBAC (Admin, Manager, Agent).
  - Security Audit logs with correlation IDs.
  - Optional Cloudflare Access (Zero Trust) support.
- **Agent Productivity**:
  - `Cmd+K` Command Palette for quick KB search and navigation.
  - Native Markdown parsing with copy-to-clipboard.
  - Sidebar folders and thread search.

## Prerequisites
- [GitHub CLI](https://cli.github.com/) (`gh`)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`wrangler`)
- [Node.js](https://nodejs.org/) & npm

## Deployment Instructions

### 1. Authenticate
```bash
gh auth login
wrangler login
```

### 2. Database Setup
```bash
wrangler d1 create car-rental-db
# Copy the database_id to apps/worker/wrangler.toml
wrangler d1 migrations apply car-rental-db --remote
```

### 3. Deploy Worker (Backend)
```bash
cd apps/worker
npm install
wrangler deploy
```

### 4. Deploy Pages (Frontend)
```bash
cd apps/web
echo "VITE_API_URL=https://your-worker.workers.dev" > .env.production
npm install && npm run build
wrangler pages deploy dist --project-name car-rental-copilot
```

### 5. Configure Secrets
```bash
wrangler secret put SESSION_SECRET --name car-rental-api
wrangler secret put HF_TOKEN --name car-rental-api # (Optional)
```

## Features Demo
- **No-AI Mode**: Disable all models in the Admin Registry. The chat will still provide answers using KB citations.
- **Command Palette**: Press `Cmd+K` to jump between KB docs and threads.
- **License Guard**: Try adding a non-permissive model repo from HF; the system will refuse to enable it.
