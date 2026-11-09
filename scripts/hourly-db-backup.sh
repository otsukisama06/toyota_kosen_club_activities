#!/bin/sh
set -eu

export TZ="${TZ:-Asia/Tokyo}"

BACKUP_ROOT="${BACKUP_ROOT:-/backups}"
PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-club}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"

if [ -z "$POSTGRES_PASSWORD" ]; then
  echo "POSTGRES_PASSWORD is required" >&2
  exit 1
fi

HANDBALL_DIR="$BACKUP_ROOT/handball"
TABLE_TENNIS_DIR="$BACKUP_ROOT/table-tennis"
RETENTION_MINUTES=4320
MAX_FILES=6

mkdir -p "$HANDBALL_DIR" "$TABLE_TENNIS_DIR"

echo "[$(date -Iseconds)] waiting for postgres..."
until PGPASSWORD="$POSTGRES_PASSWORD" pg_isready \
  --host "$PGHOST" \
  --port "$PGPORT" \
  --username "$POSTGRES_USER" \
  --dbname postgres >/dev/null 2>&1; do
  sleep 2
done
echo "[$(date -Iseconds)] postgres is ready"

backup_one() {
  label="$1"
  db_name="$2"
  output_dir="$3"

  timestamp="$(date +"%Y%m%d-%H0000")"
  output_file="$output_dir/${label}-${timestamp}.dump"
  temp_file="${output_file}.tmp"

  echo "[$(date -Iseconds)] backup start: $db_name -> $output_file"
  rm -f "$temp_file"
  if PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
    --host "$PGHOST" \
    --port "$PGPORT" \
    --username "$POSTGRES_USER" \
    --format=custom \
    --no-owner \
    --no-privileges \
    --dbname "$db_name" \
    --file "$temp_file"; then
    mv -f "$temp_file" "$output_file"
  else
    rm -f "$temp_file" "$output_file"
    echo "[$(date -Iseconds)] backup failed: $db_name" >&2
    return 1
  fi

  # 3日より古いバックアップを削除
  find "$output_dir" -type f -name "$label-*.dump" -mmin +"$RETENTION_MINUTES" -delete

  # 念のため、最新6本だけ残す（0時・12時の1日2本×3日）
  file_list="$(ls -1t "$output_dir"/$label-*.dump 2>/dev/null || true)"
  if [ -n "$file_list" ]; then
    echo "$file_list" | awk -v max_files="$MAX_FILES" 'NR>max_files {print}' | xargs -r rm -f
  fi

  echo "[$(date -Iseconds)] backup done: $db_name"
}

to_int() {
  value="${1#0}"
  if [ -z "$value" ]; then
    value=0
  fi
  printf '%s' "$value"
}

sleep_until_next_run() {
  hour="$(to_int "$(date +%H)")"
  minute="$(to_int "$(date +%M)")"
  second="$(to_int "$(date +%S)")"

  if [ "$hour" -eq 0 ] || [ "$hour" -eq 12 ]; then
    if [ "$minute" -eq 0 ] && [ "$second" -eq 0 ]; then
      return
    fi
  fi

  if [ "$hour" -lt 12 ]; then
    sleep_seconds=$(( (12 - hour) * 3600 - minute * 60 - second ))
  else
    sleep_seconds=$(( (24 - hour) * 3600 - minute * 60 - second ))
  fi

  echo "[$(date -Iseconds)] waiting ${sleep_seconds}s until next backup window"
  sleep "$sleep_seconds"
}

sleep_until_next_run

while true; do
  # 片方が失敗してももう片方のバックアップは続行する
  backup_one "handball" "handball_notes" "$HANDBALL_DIR" || true
  backup_one "table-tennis" "table_tennis_notes" "$TABLE_TENNIS_DIR" || true
  sleep_until_next_run
done
