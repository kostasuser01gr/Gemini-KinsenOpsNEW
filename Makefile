# God-Tier Master Ultra - RentalMaster Platform

.PHONY: setup lint fmt typecheck test e2e audit build migrate migrate-safe deploy deploy-atomic smoke-prod logs backup-r2 backup-local restore deploy-check verify full provision workspace-create workspace-destroy canary dashboard nebula jail-list jail-release metrics status-gen aegis-verify

STRICT_FREE_MODE ?= true
STAGE ?= dev
WORKER_URL ?= https://ops-api.dataos-api.workers.dev
ADMIN_TOKEN ?= ""

setup:
	npm install
	bash scripts/cloudflare_connect.sh $(STAGE)

provision:
	bash scripts/cloudflare_connect.sh $(STAGE)
	npx wrangler kv:namespace create JAIL || true
	npx wrangler d1 migrations apply ops-db --remote -c apps/worker/wrangler.toml || true

deploy-atomic:
	bash scripts/deploy_atomic.sh $(WORKER_URL)

nebula:
	bash scripts/nebula.sh $(WORKER_URL) $(ADMIN_TOKEN)

aegis-verify:
	npx wrangler d1 execute ops-db --remote --command "SELECT id, action, entry_hash FROM forensic_chain ORDER BY id ASC" -c apps/worker/wrangler.toml

jail-list:
	bash scripts/jail_manage.sh list

jail-release:
	bash scripts/jail_manage.sh release $(IP)

metrics:
	npx wrangler analytics-engine query "SELECT * FROM METRICS ORDER BY timestamp DESC LIMIT 10"

status-gen:
	curl -s -H "Cookie: session=$(ADMIN_TOKEN)" $(WORKER_URL)/api/admin/report > status_report.json
	echo "System Status: $$(jq -r .status status_report.json)" > status.html
	echo "Users: $$(jq -r .user_count status_report.json)" >> status.html

lint:
	npm run lint -w apps/worker
	npm run lint -w apps/web

fmt:
	npm run fmt -w apps/worker
	npm run fmt -w apps/web

typecheck:
	npm run typecheck -w apps/worker
	npm run typecheck -w apps/web

test:
	npm run test -w apps/worker
	npm run test -w apps/web

build:
	npm run build -w apps/worker
	npm run build -w apps/web

migrate-safe:
	bash scripts/migrate_safe.sh $(WORKER_URL) $(ADMIN_TOKEN)

deploy:
	cd apps/worker && npx wrangler deploy
	cd apps/web && npx wrangler pages deploy dist --project-name=ops-frontend

full: deploy-check verify migrate-safe deploy-atomic smoke-prod
