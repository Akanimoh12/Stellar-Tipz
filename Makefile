.DEFAULT_GOAL := help
.PHONY: help setup dev build test lint typecheck clean \
	contracts-dev contracts-build contracts-test contracts-lint contracts-typecheck \
	backend-dev backend-build backend-test backend-lint backend-typecheck \
	frontend-dev frontend-build frontend-test frontend-lint frontend-typecheck

CACHE := ./scripts/run-cached-task.sh

help:
	@printf '%s\n' 'Stellar Tipz monorepo tasks' '' \
	  '  make setup       Install root, backend, and frontend dependencies' \
	  '  make dev         Start the full local development environment' \
	  '  make build       Build contracts, backend, and frontend (cached)' \
	  '  make test        Run tests in all three components' \
	  '  make lint        Lint contracts, backend, and frontend' \
	  '  make typecheck   Check backend and frontend types (builds contract first)' '' \
	  'Run one component with make <component>-<task>, e.g. make backend-test.'

setup:
	npm ci
	npm ci --prefix backend
	npm ci --prefix frontend-scaffold --legacy-peer-deps

dev:
	./scripts/dev-environment.sh up

build: contracts-build backend-build frontend-build

test: contracts-test backend-test frontend-test

lint: contracts-lint backend-lint frontend-lint

# Contract Wasm is built first because frontend generation/type checks consume
# the contract interface and must never run against stale contract artifacts.
typecheck: contracts-build backend-typecheck frontend-typecheck

contracts-dev:
	cd contracts && cargo watch -x test -x build

contracts-build:
	$(CACHE) contracts-build contracts -- cargo build --target wasm32-unknown-unknown --release

contracts-test:
	cd contracts && cargo test

contracts-lint:
	cd contracts && cargo fmt -- --check && cargo clippy -- -D warnings

contracts-typecheck: contracts-build

backend-dev:
	npm run dev --prefix backend

backend-build:
	$(CACHE) backend-build backend -- npm run build --prefix backend

backend-test:
	npm run test --prefix backend

backend-lint:
	npm run lint --prefix backend

backend-typecheck:
	$(CACHE) backend-typecheck backend -- npm run typecheck --prefix backend

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

clean:
	cd contracts && cargo clean
	rm -rf backend/dist frontend-scaffold/build .cache/task-runner
