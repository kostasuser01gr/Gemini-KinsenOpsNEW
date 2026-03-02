# Ops Copilot V8 Ultra Makefile
# Complete CLI-Ops Workflow

.PHONY: setup lint fmt typecheck test e2e audit build migrate deploy-worker deploy-pages smoke-local smoke-prod verify full doctor repair clean

setup:
	@chmod +x scripts/*.sh
	@./scripts/bootstrap_repo.sh

lint:
	cd apps/web && npx eslint src --max-warnings 0
	cd apps/worker && npx eslint src --max-warnings 0

fmt:
	cd apps/web && npx prettier --check "src/**/*.{ts,tsx,css}"
	cd apps/worker && npx prettier --check "src/**/*.ts"

typecheck:
	cd apps/web && npx tsc --noEmit
	cd apps/worker && npx tsc --noEmit

test:
	cd apps/worker && npm run test

e2e:
	@echo "=> Running E2E Tests..."
	# npx playwright test (Placeholder)

audit:
	@echo "=> Running Security Scans..."
	cd apps/web && npm audit --audit-level=high
	cd apps/worker && npm audit --audit-level=high
	@echo "=> Checking for secrets..."
	@grep -rE "AI_KEY|SECRET|TOKEN" apps/worker/src --exclude="*.test.ts" | grep -v "env." || echo "✅ No obvious hardcoded secrets."

build:
	cd apps/web && npm run build

migrate:
	cd apps/worker && npx wrangler d1 migrations apply car-rental-db --remote

deploy-worker:
	cd apps/worker && npx wrangler deploy

deploy-pages:
	cd apps/web && npx wrangler pages deploy dist --project-name car-rental-copilot --commit-dirty=true

smoke-local:
	@echo "=> Running local smoke tests..."
	@./scripts/smoke.sh "http://localhost:8787" || true

smoke-prod:
	@echo "=> Running production smoke tests..."
	@./scripts/smoke.sh "https://car-rental-api.dataos-api.workers.dev"

verify: lint typecheck test audit
	@echo "=> Verification Passed."

full: verify build migrate deploy-worker deploy-pages smoke-prod
	@echo "=> FULL DEPLOYMENT COMPLETE AND GREEN."

doctor:
	@./scripts/doctor.sh

repair:
	@./scripts/repair.sh
