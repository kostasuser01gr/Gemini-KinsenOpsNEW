# Car Rental Ops Copilot (V11 Ultimate)

## Enterprise-Grade CLI-Driven Ops Platform
Deployed entirely on Cloudflare Pages, Workers, and D1.

### 🔐 High-Security Features
- **App PIN Lock**: 4-digit device-local unlock using PBKDF2/SHA-256 (no PIN sent to server).
- **E2EE Password Vault**: End-to-End Encrypted credentials storage. AES-GCM encryption performed client-side with DEK/KEK derivation. Server sees only ciphertext.
- **Trusted Device Management**: Track and revoke device access remotely.
- **Never-Bill-By-Design**: Strict compliance guard blocking paid AI configurations.

### 🚀 Deployment (CLI-Only)

```bash
# 1. Provision Infrastructure
./scripts/cloudflare_connect.sh

# 2. Set Mandatory Secrets
wrangler secret put SESSION_SECRET --name car-rental-api
wrangler secret put TURNSTILE_SECRET_KEY --name car-rental-api

# 3. Full Verification and Deploy
make full
```

### 🛠️ Operator CLI Pack
- **Check Status**: `./scripts/cloudflare_status.sh`
- **Verify Vault API**: `make vault-smoke TOKEN=<TOKEN>`
- **Export Workspace**: `./scripts/export_workspace.sh <URL> <TOKEN>`
- **Run Doctor**: `make doctor`

## Architecture Highlights
- **Backend**: itty-router + D1 + WebCrypto.
- **Frontend**: React + Tailwind + lucide-react + react-markdown.
- **Offline**: PWA + IndexedDB cache for threads and KB snippets.
- **Analytics**: Model KPIs (latency, success rate, fallback frequency).
