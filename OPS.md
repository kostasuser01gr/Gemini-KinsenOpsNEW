# OPS.md

## Limits
- **Workers**: 100k req/day free. 10ms CPU limit.
- **D1**: 5M read/100k write/day. 500MB storage.

## Caching Strategy
- Cache KB results for 60s.
- Cache thread lists for 30s.
- Invalidate on write (best effort).

## Data Retention
- Old threads archived to `archived_chat_threads` after 30 days.
- Audit logs rolled up daily to `audit_rollups_daily`.
- Triggered manually via Admin UI or daily Cron.
