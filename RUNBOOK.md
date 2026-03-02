# Ops Runbook

## 1. Secrets Management
To rotate or update secrets:
```bash
wrangler secret put SESSION_SECRET --name car-rental-api
wrangler secret put TURNSTILE_SECRET_KEY --name car-rental-api
```

## 2. Database Recovery
If you need to restore a workspace from a JSON snapshot:
```bash
./scripts/restore.sh https://car-rental-api.dataos-api.workers.dev <TOKEN> backup.json
```

To rerun migrations:
```bash
make migrate
```

## 3. Deployment Rollback
Workers:
```bash
wrangler deployments list
wrangler rollback <VERSION_ID>
```

Pages:
```bash
wrangler pages deployment list --project-name car-rental-copilot
# Rollback is usually done by pushing a previous known-good git SHA
```

## 4. Retention Management
To manually trigger archiving:
```bash
# Admin only
curl -X POST -H "Authorization: Bearer <TOKEN>" https://car-rental-api.dataos-api.workers.dev/api/admin/retention/run
```
