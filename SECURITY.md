# Security & Governance

## Threat Model
- **Public Signup Abuse**: Mitigated via Cloudflare Turnstile (bot protection) and Token Bucket Rate Limiting (per IP). Hard 15-minute lockouts apply after 5 failed login attempts.
- **Model Abuse (Billing)**: Addressed by strict verification. The system statically refuses to invoke models not explicitly flagged `FREE_ONLY`.
- **Jailbreaks**: The Model Router checks model names and tags against a static blocklist (e.g. `uncensored`, `nsfw`, `roleplay`) and prevents enabling them. HF models are explicitly checked against the Hugging Face API for `Apache-2.0` or `MIT` licenses.

## RBAC Matrix
The application implements strict Role-Based Access Control via `apps/worker/src/rbac.ts`. All endpoints explicitly default to "deny" and require middleware to permit action.

| Permission | Admin | Manager | Agent |
|------------|-------|---------|-------|
| kb:read | ✅ | ✅ | ✅ |
| kb:write | ✅ | ✅ | ❌ |
| models:read | ✅ | ✅ | ❌ |
| models:write | ✅ | ❌ | ❌ |
| audit:read | ✅ | ❌ | ❌ |
| macros:read | ✅ | ✅ | ✅ |
| macros:write| ✅ | ✅ | ❌ |
| threads:read| ✅ | ✅ | ✅ |
| threads:write|✅ | ✅ | ✅ |
| users:read | ✅ | ✅ | ❌ |
| users:write | ✅ | ❌ | ❌ |

## Audit Logging
- ALL sensitive actions (model creation, user role updates, kb uploads) and reads (accessing audit logs or user lists) are recorded in `audit_logs` in D1.
- Each request is tagged with a `correlation_id` (UUID) to trace actions across the system.