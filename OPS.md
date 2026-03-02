# Operations & Limits (v6)

## Cloudflare Free Tier Optimization

### Workers (100,000 requests / day)
- **Token Bucket Limiter**: API-level rate limiting (30 req/min for chat, 5 req/min for auth).
- **CPU Management**: Minimized heavy parsing; chunked retention processing.

### D1 Database (5M reads, 100k writes / day)
- **Data Retention**: Old threads (>30 days) are auto-archived into separate tables.
- **Audit Compaction**: Old audit logs are rolled up into daily summaries (`audit_rollups_daily`) and deleted.
- **Caching**: 60s cache on KB search and thread listing to reduce read pressure.

### Model KPIs & Failover
- **Telemetry**: Success/latency tracking for all model calls.
- **Auto-Switch**: Circuit breaker marks providers as unhealthy on 429/timeout, triggering fallback to next free model.

## Disaster Recovery
- **JSON Portability**: Full system snapshots (KB, Macros, sanitized Users) can be exported/imported via Admin UI or CLI.
