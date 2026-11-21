.DEFAULT_GOAL := help
.PHONY: help setup dev build test lint typecheck clean \
	contracts-dev contracts-build contracts-test contracts-fmt contracts-clippy contracts-lint contracts-typecheck contracts-wasm contracts-size contracts-check-size contracts-clean \
	backend-dev backend-build backend-test backend-coverage backend-lint backend-typecheck backend-db-up backend-db-down backend-test-db-up backend-test-db-down backend-test-db-reset backend-migrate backend-seed \
	frontend-dev frontend-build frontend-test frontend-lint frontend-typecheck frontend-clean

CACHE := ./scripts/run-cached-task.sh

help:
	@printf '%s\n' 'Stellar Tipz monorepo tasks' '' \
	  '  make setup                 Install all dependencies' \
	  '  make dev                   Start the full dev profile' \
	  '  make build|test|lint       Run across every component' \
	  '  make typecheck             Typecheck backend/frontend after contract build' \
	  '  make backend-db-up         Start shared Postgres/Redis' \
	  '  make backend-test-db-up    Start isolated test Postgres/Redis' '' \
	  'Use make <component>-<task> for a single package.'

setup:
	npm ci
	npm ci --prefix backend
	npm ci --prefix frontend-scaffold --legacy-peer-deps

dev:
	docker compose --profile dev up

build: contracts-build backend-build frontend-build
test: contracts-test backend-test frontend-test
lint: contracts-lint backend-lint frontend-lint
typecheck: contracts-build backend-typecheck frontend-typecheck

contracts-dev:
	cd contracts && cargo watch -x test -x build
contracts-build:
	$(CACHE) contracts-build contracts -- cargo build --target wasm32-unknown-unknown --release
contracts-test:
	cd contracts && cargo test
contracts-fmt:
	cd contracts && cargo fmt -- --check
contracts-clippy:
	cd contracts && cargo clippy -- -D warnings
contracts-lint: contracts-fmt contracts-clippy
contracts-typecheck: contracts-wasm
contracts-wasm:
	cd contracts && cargo build --target wasm32-unknown-unknown --release
contracts-size: contracts-wasm
	@find contracts/target/wasm32-unknown-unknown/release -name '*.wasm' -maxdepth 1 -print -exec ls -lh {} \;
contracts-check-size: contracts-size
	@SIZE=$$(stat -c%s contracts/target/wasm32-unknown-unknown/release/tipz_contract.wasm 2>/dev/null || stat -f%z contracts/target/wasm32-unknown-unknown/release/tipz_contract.wasm); test $$SIZE -le 65536
contracts-clean:
	cd contracts && cargo clean

backend-dev:
	npm run dev --prefix backend
backend-build:
	$(CACHE) backend-build backend -- npm run build --prefix backend
backend-test:
	npm run test --prefix backend
backend-coverage:
	npm run test:coverage --prefix backend
backend-lint:
	npm run lint --prefix backend
backend-typecheck:
	$(CACHE) backend-typecheck backend -- npm run typecheck --prefix backend
backend-db-up:
	docker compose up -d postgres redis
backend-db-down:
	docker compose down
backend-test-db-up:
	docker compose --profile test up -d postgres-test redis-test
backend-test-db-down:
	docker compose --profile test down
backend-test-db-reset:
	docker compose --profile test down -v
	docker compose --profile test up -d postgres-test redis-test
backend-migrate:
	npm run prisma:migrate --prefix backend
backend-seed:
	npm run db:seed --prefix backend

frontend-dev:
	npm run dev --prefix frontend-scaffold
frontend-build:
	$(CACHE) frontend-build frontend-scaffold -- npm run build --prefix frontend-scaffold
frontend-test:
	npm run test --prefix frontend-scaffold
frontend-lint:
	npm run lint --prefix frontend-scaffold
frontend-typecheck: contracts-build
	$(CACHE) frontend-typecheck frontend-scaffold contracts -- npm run typecheck --prefix frontend-scaffold
frontend-clean:
	rm -rf frontend-scaffold/dist

clean: contracts-clean frontend-clean
	rm -rf backend/dist .cache/task-runner
