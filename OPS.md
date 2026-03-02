# Operations & Limits (v9)

## Quota Governor
- **Dynamic Throttling**: Automatically increases caching and disables expensive features when nearing D1 write limits.
- **Thresholds**: Alerts at 80% of daily 100k D1 write limit.
- **Status API**: `/api/admin/quota/status` provides real-time governance metrics.

## Recovery & Resiliency
- **Recovery Mode**: Frontend automatically switches to read-only offline-first UI when API errors spike.
- **Error Envelope**: Every API error contains a `correlation_id` and `retry_after` hint.
- **Operation Replay**: `scripts/retry_failed_ops.sh` allows replaying idempotent failed actions from logs.

## Performance
- **FAST Search**: Default FTS5 indexing.
- **DEEP Search**: Scoped thread search (restricted to prevent full table scans).
- **Search Cost**: UI shows complexity estimates to discourage heavy queries.
