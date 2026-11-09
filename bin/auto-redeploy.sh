#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.tunnel}"
DEBOUNCE_SECONDS="${DEBOUNCE_SECONDS:-2}"
INITIAL_DEPLOY="${INITIAL_DEPLOY:-1}"

COMPOSE_ARGS=(
  --env-file "$ENV_FILE"
  -f "$ROOT_DIR/docker-compose.yml"
  -f "$ROOT_DIR/docker-compose.tunnel.yml"
)

WATCH_TARGETS=(
  "$ROOT_DIR/apps"
  "$ROOT_DIR/gateway"
  "$ROOT_DIR/docker-compose.yml"
  "$ROOT_DIR/docker-compose.tunnel.yml"
  "$ROOT_DIR/Dockerfile"
)

IGNORE_REGEX='(^|/)(\.git|node_modules|\.next|backups)(/|$)|~$|\.sw.$|\.tmp$'

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing command: $1"
    echo "Install on Raspberry Pi: sudo apt install -y inotify-tools"
    exit 1
  fi
}

redeploy() {
  echo "[$(date '+%F %T')] Rebuilding and restarting containers..."
  docker compose "${COMPOSE_ARGS[@]}" up -d --build
  echo "[$(date '+%F %T')] Redeploy complete"
}

require_command docker
require_command inotifywait

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE"
  echo "Create it first, or run with: ENV_FILE=/path/to/.env.tunnel $0"
  exit 1
fi

echo "Project root: $ROOT_DIR"
echo "Using env file: $ENV_FILE"
echo "Watching for changes... (Ctrl+C to stop)"

if [[ "$INITIAL_DEPLOY" == "1" ]]; then
  redeploy
fi

last_run=0

inotifywait -m -r \
  --event modify,create,delete,move \
  --format '%w%f' \
  --exclude "$IGNORE_REGEX" \
  "${WATCH_TARGETS[@]}" |
while IFS= read -r changed; do
  now="$(date +%s)"
  if (( now - last_run < DEBOUNCE_SECONDS )); then
    continue
  fi

  echo "[$(date '+%F %T')] Change detected: $changed"
  if ! redeploy; then
    echo "[$(date '+%F %T')] Redeploy failed. Waiting for next change..."
  fi
  # ビルド中に溜まった変更イベントで再ビルドしないよう、完了時刻を基準にする
  last_run="$(date +%s)"
done
