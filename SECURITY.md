# SECURITY.md

## Threat Model
- **Public Signup**: Protected by Turnstile + Token Bucket Rate Limiting.
- **Model Abuse**: STRICT_FREE_MODE prevents any billing-capable providers from being used.
- **Data Breaches**: RBAC (Admin/Manager/Agent) limits data visibility. Audit logs trace all actions.

## Safeguards
- **BillingGuard**: Centralized check ensuring no paid API keys exist in strict mode.
- **Rate Limiting**: Per-IP and per-email limits on sensitive endpoints.
- **Passkeys**: Optional WebAuthn support for passwordless security.
