# Ops Copilot Roadmap

## Phase 1 (Completed)
- ✅ Free-only Model Router (HF + Workers AI)
- ✅ Auto-Fallback Circuit Breaker
- ✅ Deterministic KB citations & FTS5 search
- ✅ Open Signup + Turnstile + Rate Limiting
- ✅ Agent UI: Cmd+K, Markdown, Tool Cards

## Phase 2 (Next Up)
- [ ] **Collaborative Threads**: Implement Cloudflare Durable Objects to allow multiple agents to view the same thread, showing live "typing..." indicators.
- [ ] **Agent Internal Notes**: Allow adding `role="note"` messages to threads that are visible only to users with `agent/manager/admin` roles, not the customer (if customer-facing UI is ever added).
- [ ] **Queue Workers**: Use Cloudflare Queues for heavy tasks like audit log compaction and daily rollup analytics.

## Phase 3 (Future)
- [ ] **Advanced RAG**: Integrate Cloudflare Vectorize for semantic search alongside FTS5.
- [ ] **SOP Generation**: Allow the Copilot to suggest new KB articles based on common, successfully resolved threads.