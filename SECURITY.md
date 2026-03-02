# Security & Governance (v6)

## Strict Free Mode
- **Design Constraint**: `STRICT_FREE_MODE=true` ensures no model provider that could trigger billing is ever invoked.
- **Fail-Closed**: If no verified free models are available, the system falls back to No-AI mode rather than attempting a paid subrequest.

## Authentication & Authorization
- **Open Signup**: Public registration enabled, defaulting to `agent` role.
- **Turnstile**: Bot protection integrated into signup/login.
- **RBAC**: Middleware-enforced permission matrix (deny-by-default).

## Audit Trail
- **Correlation ID**: Every request tracked with a unique UUID.
- **Archive Integrity**: Archived logs maintain metadata for regulatory compliance.
