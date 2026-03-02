# Operations & Limits

## Cloudflare Free Tier Guardrails

This project is architected specifically to stay within the Cloudflare Free Tier limits:

### Workers (100,000 requests / day)
- **Token Bucket Limiter**: The API enforces strict rate limits on chat requests (30 req / min) and Auth endpoints (5 req / min) to prevent single-actor abuse from exhausting the daily pool.
- **Fail-Closed/Fail-Open**: If the daily worker limit is exceeded, Cloudflare will return a 1015 error. The frontend gracefully shows a generic "Ops Engine Offline" state.

### D1 Database (5M reads, 100k writes / day)
- **Caching**: Heavy read paths like `/api/chat/threads` and `/api/kb/search` are cached via the Cloudflare Cache API for up to 60 seconds, drastically reducing D1 read volume.
- **Indexes**: All tables (`chat_messages`, `audit_logs`, `kb_documents`) use highly optimized indexes (`0006_upgrades.sql`) preventing full table scans.

### Workers AI (10,000 Neurons / day)
- **Neuron Tracking**: The `ai_usage_log` table tracks approximate neuron usage when routing to `CF_WORKERS_AI_FREE`. If the daily limit is hit, the router marks the CF provider as unhealthy and automatically falls back to `HF_ROUTED_FREE` or the `No-AI` deterministic mode.

## Maintenance
- Ensure you periodically export the Audit Logs to CSV via the Admin Panel and manually run DELETE queries to compact the D1 database if it approaches the 500MB free tier limit.