# Ops Copilot V6 Makefile

.PHONY: setup lint typecheck test build migrate deploy smoke verify full

setup:
	cd apps/web && npm install
	cd apps/worker && npm install

lint:
	cd apps/web && npx eslint src
	cd apps/worker && npx eslint src

typecheck:
	cd apps/web && npx tsc --noEmit
	cd apps/worker && npx tsc --noEmit

test:
	cd apps/worker && npm run test

build:
	cd apps/web && npm run build

migrate:
	cd apps/worker && wrangler d1 migrations apply car-rental-db --remote

deploy:
	cd apps/worker && wrangler deploy
	cd apps/web && wrangler pages deploy dist --project-name car-rental-copilot --commit-dirty=true

smoke:
	@echo "Running smoke tests..."
	curl -f https://car-rental-api.dataos-api.workers.dev/api/kb/search?q=test || exit 1
	@echo "Smoke tests passed."

verify: lint typecheck test build audit

audit:
	cd apps/web && npm audit --audit-level=high
	cd apps/worker && npm audit --audit-level=high

full: verify migrate deploy smoke
