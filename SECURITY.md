# SECURITY.md (v9)

## Data Privacy
- **PII Guard**: Automatically redacts emails and phone numbers from chat history.
- **Reveal Protocol**: Users with `pii:view` permission can reveal redacted content; each reveal is logged in `pii_reveal_logs` for auditing.

## Infrastructure Security
- **Strict Free Mode**: Block-level enforcement preventing billing-capable subrequests.
- **Canary Rollouts**: New model providers are tested on 5% traffic before full promotion.
- **Passkeys**: Opt-in WebAuthn support for administrator actions.

## Governance
- **Audit Ledger**: Comprehensive tracking of all write operations and sensitive data access.
- **Role Hierarchy**: Admin > Manager > Agent (Deny-by-default).
