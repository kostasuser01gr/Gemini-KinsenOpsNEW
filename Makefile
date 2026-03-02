# RentalMaster Platform - Scaled Ops Makefile

SHELL := /bin/bash
REPORT_DIR ?= .reports

.PHONY: setup provision lint fmt typecheck test audit build \
	deploy-check verify migrate migrate-dry-run migrate-safe migration-policy-check \
	deploy deploy-worker deploy-pages deploy-atomic smoke-local smoke-prod \
	deploy-safe synthetic-probes rollback-on-failure \
	workflow-parity \
	full nebula aegis-verify jail-list jail-release metrics status-gen \
	backup-r2 backup-local restore logs

STRICT_FREE_MODE ?= true
AUDIT_FAIL_LEVEL ?= critical
STAGE ?= dev
WORKER_URL ?= https://ops-api.dataos-api.workers.dev
LOCAL_WORKER_URL ?= http://127.0.0.1:8787
ADMIN_TOKEN ?=
DB_NAME ?= ops-db

$(REPORT_DIR):
	mkdir -p $(REPORT_DIR)

setup:
	npm install
	bash scripts/cloudflare_connect.sh $(STAGE)

provision:
	bash scripts/cloudflare_connect.sh $(STAGE)
	npx wrangler kv:namespace create JAIL
	npx wrangler d1 migrations apply $(DB_NAME) --remote -c apps/worker/wrangler.toml

lint:
	npx eslint apps/worker/src --ext .ts
	npx eslint apps/web/src --ext .ts,.tsx

fmt:
	npm run fmt -w apps/worker
	npm run fmt -w apps/web

typecheck:
	npm run typecheck -w apps/worker
	npm run typecheck -w apps/web

test:
	npm run test -w apps/worker
	npm run test -w apps/web

audit: | $(REPORT_DIR)
	npm audit --audit-level=$(AUDIT_FAIL_LEVEL) --json > $(REPORT_DIR)/npm-audit.json
	cat $(REPORT_DIR)/npm-audit.json | jq -r '.metadata.vulnerabilities // {}'

build:
	npm run build -w apps/worker
	npm run build -w apps/web

migration-policy-check:
	bash scripts/check_migrations.sh apps/worker/migrations 15

workflow-parity:
	bash scripts/workflow_parity_check.sh

migrate-dry-run:
	bash scripts/migration_smoke.sh $(DB_NAME) .wrangler/state-migration-smoke apps/worker/wrangler.toml

migrate:
	npx wrangler d1 migrations apply $(DB_NAME) --remote -c apps/worker/wrangler.toml

migrate-safe:
	bash scripts/migrate_safe.sh $(WORKER_URL) $(ADMIN_TOKEN)

deploy-worker:
	cd apps/worker && npx wrangler deploy -c wrangler.toml

deploy-pages:
	cd apps/web && npx wrangler pages deploy dist --project-name=ops-frontend

deploy:
	$(MAKE) deploy-worker
	$(MAKE) deploy-pages

deploy-atomic:
	bash scripts/deploy_atomic.sh $(WORKER_URL)

deploy-check:
	STRICT_FREE_MODE=$(STRICT_FREE_MODE) bash scripts/preflight.sh

verify: deploy-check workflow-parity lint typecheck test migration-policy-check migrate-dry-run audit

smoke-local:
	bash scripts/smoke.sh $(LOCAL_WORKER_URL)

smoke-prod:
	bash scripts/smoke.sh $(WORKER_URL)

synthetic-probes:
	bash scripts/synthetic_probes.sh $(WORKER_URL) $(ADMIN_TOKEN) $(MCP_API_KEY)

rollback-on-failure:
	bash scripts/rollback.sh $(WORKER_URL)

deploy-safe:
	bash scripts/deploy_safe.sh $(WORKER_URL) $(ADMIN_TOKEN) $(MCP_API_KEY) $(ROLLBACK_TAG)

full: verify migrate-safe deploy smoke-prod

nebula:
	bash scripts/nebula.sh $(WORKER_URL) $(ADMIN_TOKEN)

aegis-verify:
	npx wrangler d1 execute $(DB_NAME) --remote --command "SELECT id, action, entry_hash FROM forensic_chain ORDER BY id ASC" -c apps/worker/wrangler.toml

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
