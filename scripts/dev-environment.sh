#!/usr/bin/env bash
# Start or stop the complete local Stellar Tipz development environment.
set -euo pipefail
umask 077

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT_DIR"

ACTION=${1:-up}
DEV_DIR="$ROOT_DIR/.dev"
STELLAR_CONFIG_DIR="$DEV_DIR/stellar"
STELLAR_PORT=${TIPZ_STELLAR_PORT:-8000}
API_PORT=${TIPZ_API_PORT:-4000}
FRONTEND_PORT=${TIPZ_FRONTEND_PORT:-3000}
RPC_URL="http://localhost:${STELLAR_PORT}/rpc"
HORIZON_URL="http://localhost:${STELLAR_PORT}"
PASSPHRASE='Standalone Network ; February 2017'
NATIVE_TOKEN_ID='CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'

mkdir -p "$DEV_DIR"
chmod 700 "$DEV_DIR"
touch "$DEV_DIR/backend.env" "$DEV_DIR/frontend.env" "$DEV_DIR/postgres.env"
chmod 600 "$DEV_DIR/backend.env" "$DEV_DIR/frontend.env" "$DEV_DIR/postgres.env"

stellar_cmd() {
  stellar --config-dir "$STELLAR_CONFIG_DIR" "$@"
}

usage() {
  cat <<'EOF'
Usage: ./scripts/dev-environment.sh [up|down|status|logs]

  up      Build and deploy the contract locally, migrate/seed the database,
          start all services, and wait for their readiness checks (default).
  down    Stop app services and the local Stellar Quickstart container.
  status  Show the app containers and local RPC health.
  logs    Follow app service logs.
EOF
}

wait_for() {
  local label=$1
  shift
  for ((attempt = 0; attempt < 120; attempt++)); do
    if "$@" >/dev/null 2>&1; then
      printf 'ready: %s\n' "$label"
      return 0
    fi
    sleep 2
  done
  printf 'Timed out waiting for %s. Recent service logs:\n' "$label" >&2
  docker compose logs --tail=80 migrate api indexer jobs frontend >&2 || true
  return 1
}

rpc_is_healthy() {
  curl --connect-timeout 2 --max-time 5 -fsS "$RPC_URL" \
    -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' |
    grep -Eq '"status"[[:space:]]*:[[:space:]]*"healthy"'
}

migration_succeeded() {
  local container_id result
  container_id=$(docker compose ps --all -q migrate)
  [ -n "$container_id" ] || return 1
  result=$(docker inspect --format '{{.State.Status}} {{.State.ExitCode}}' "$container_id")
  [ "$result" = 'exited 0' ]
}

case "$ACTION" in
  up)
    for command in docker stellar cargo curl openssl; do
      command -v "$command" >/dev/null 2>&1 || {
        printf 'Required command not found: %s\n' "$command" >&2
        exit 1
      }
    done
    docker compose version >/dev/null
    mkdir -p "$DEV_DIR" "$STELLAR_CONFIG_DIR"
    chmod 700 "$STELLAR_CONFIG_DIR"

    if ! rpc_is_healthy; then
      echo 'Starting the local Stellar network...'
      stellar --config-dir "$STELLAR_CONFIG_DIR" container start local \
        --name tipz-local --ports-mapping "${STELLAR_PORT}:8000"
    fi
    wait_for 'local Stellar RPC' rpc_is_healthy

    # Keep Stellar CLI aliases and development signing keys scoped to this
    # checkout instead of changing the contributor's global Stellar config.
    stellar_cmd network rm local >/dev/null 2>&1 || true
    stellar_cmd network add local --rpc-url "$RPC_URL" --network-passphrase "$PASSPHRASE"
    if ! stellar_cmd keys public-key tipz-dev >/dev/null 2>&1; then
      stellar_cmd keys generate tipz-dev
    fi
    deployer=$(stellar_cmd keys public-key tipz-dev)
    curl --connect-timeout 2 --max-time 30 -fsS "$HORIZON_URL/friendbot?addr=$deployer" >/dev/null
    local_jwt_secret=$(sed -n 's/^JWT_SECRET=//p' "$DEV_DIR/backend.env" | head -n 1)
    if [ "${#local_jwt_secret}" -lt 32 ]; then
      local_jwt_secret=$(openssl rand -hex 32)
    fi
    local_postgres_password=$(sed -n 's/^POSTGRES_PASSWORD=//p' "$DEV_DIR/postgres.env" | head -n 1)
    if [ "${#local_postgres_password}" -lt 32 ]; then
      local_postgres_password=$(openssl rand -hex 32)
    fi

    echo 'Building and deploying the Soroban contract...'
    cargo build --manifest-path contracts/Cargo.toml \
      --target wasm32-unknown-unknown --release --locked
    wasm_path="$ROOT_DIR/contracts/target/wasm32-unknown-unknown/release/tipz_contract.wasm"
    if [ ! -s "$wasm_path" ]; then
      echo "Contract Wasm was not produced at $wasm_path" >&2
      exit 1
    fi
    contract_id=$(stellar_cmd contract deploy --wasm "$wasm_path" \
      --source-account tipz-dev --network local)
    if ! [[ "$contract_id" =~ ^C[A-Z0-9]{55}$ ]]; then
      echo 'Stellar CLI did not return a valid contract ID.' >&2
      exit 1
    fi
    stellar_cmd contract invoke --id "$contract_id" --source-account tipz-dev \
      --network local -- initialize --admin "$deployer" \
      --fee_collector "$deployer" --fee_bps 200 --native_token "$NATIVE_TOKEN_ID"

    cat > "$DEV_DIR/backend.env" <<EOF
NODE_ENV=development
PORT=4000
API_BASE_PATH=/api/v1
CORS_ORIGIN=http://localhost:${FRONTEND_PORT}
DATABASE_URL=postgresql://tipz:${local_postgres_password}@postgres:5432/tipz?schema=public
REDIS_URL=redis://redis:6379
REALTIME_REDIS_ADAPTER_ENABLED=true
JWT_SECRET=${local_jwt_secret}
STELLAR_NETWORK=LOCAL
SOROBAN_RPC_URL=http://host.docker.internal:${STELLAR_PORT}/rpc
HORIZON_URL=http://host.docker.internal:${STELLAR_PORT}
NETWORK_PASSPHRASE=${PASSPHRASE}
CONTRACT_ID=${contract_id}
INDEXER_START_LEDGER=1
INDEXER_FINALITY_DEPTH=0
# Quickstart is quiet when no developer is submitting transactions.
INDEXER_STALL_INTERVALS=100000
EOF
    cat > "$DEV_DIR/postgres.env" <<EOF
POSTGRES_USER=tipz
POSTGRES_PASSWORD=${local_postgres_password}
POSTGRES_DB=tipz
EOF
    cat > "$DEV_DIR/frontend.env" <<EOF
VITE_API_BASE_URL=http://localhost:${API_PORT}/api/v1
VITE_SOROBAN_RPC_URL=${RPC_URL}
VITE_HORIZON_URL=${HORIZON_URL}
VITE_NETWORK_PASSPHRASE=${PASSPHRASE}
VITE_NETWORK=LOCAL
VITE_CONTRACT_ID=${contract_id}
VITE_USE_MOCK_DATA=false
EOF

    echo 'Building and starting Postgres, Redis, API, indexer, jobs, and frontend...'
    docker compose up -d --build
    wait_for 'PostgreSQL' docker compose exec -T postgres pg_isready -U tipz -d tipz
    wait_for 'Redis' docker compose exec -T redis redis-cli ping
    wait_for 'database migrations and sample data' migration_succeeded
    wait_for 'API, database, Redis, Soroban RPC, and indexer readiness' \
      curl --connect-timeout 2 --max-time 5 -fsS "http://localhost:${API_PORT}/health/ready"
    wait_for 'indexer process' docker compose exec -T indexer node -e \
      'fetch("http://127.0.0.1:9464/metrics").then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'
    wait_for 'jobs process' docker compose exec -T jobs node -e \
      'fetch("http://127.0.0.1:9464/metrics").then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'
    wait_for 'frontend' curl --connect-timeout 2 --max-time 5 -fsS "http://localhost:${FRONTEND_PORT}/"
    printf '\nLocal development environment is ready.\n  Frontend: http://localhost:%s\n  API:      http://localhost:%s/api/v1\n  Contract: %s\n' \
      "$FRONTEND_PORT" "$API_PORT" "$contract_id"
    ;;
  down)
    docker compose down
    stellar --config-dir "$STELLAR_CONFIG_DIR" container stop tipz-local >/dev/null 2>&1 || true
    echo 'Local development services stopped. Database volumes were preserved.'
    ;;
  status)
    docker compose ps --all
    if rpc_is_healthy; then
      echo 'local Stellar RPC: healthy'
    else
      echo 'local Stellar RPC: unavailable'
      exit 1
    fi
    ;;
  logs)
    docker compose logs -f
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
