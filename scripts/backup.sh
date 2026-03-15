#!/usr/bin/env bash
# Interdict backup script — dumps Postgres and ClickHouse data
# Usage: scripts/backup.sh [--output-dir DIR] [--dry-run]
set -euo pipefail

# ─── Defaults ──────────────────────────────────────────────────────────────────
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT_DIR="./backups/${TIMESTAMP}"
DRY_RUN=false

# ─── Argument parsing ─────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h | --help)
      echo "Usage: $0 [--output-dir DIR] [--dry-run]"
      echo ""
      echo "  --output-dir DIR   Backup destination (default: ./backups/YYYYMMDD_HHMMSS)"
      echo "  --dry-run          Show what would be backed up without running dumps"
      exit 0
      ;;
    *)
      echo "Error: unknown argument '$1'" >&2
      echo "Run $0 --help for usage." >&2
      exit 1
      ;;
  esac
done

# ─── Helpers ───────────────────────────────────────────────────────────────────
info()  { echo "▸ $*"; }
error() { echo "✖ $*" >&2; }

check_container() {
  local service="$1"
  if ! docker compose ps --status running --format '{{.Service}}' 2>/dev/null | grep -qx "${service}"; then
    error "Service '${service}' is not running. Start the stack first: docker compose up -d"
    return 1
  fi
}

file_size() {
  local file="$1"
  if command -v stat >/dev/null 2>&1; then
    # Linux stat
    stat --printf='%s' "$file" 2>/dev/null || stat -f '%z' "$file" 2>/dev/null || echo "?"
  else
    echo "?"
  fi
}

human_size() {
  local bytes="$1"
  if [[ "$bytes" == "?" ]]; then echo "unknown"; return; fi
  if (( bytes >= 1048576 )); then
    echo "$(( bytes / 1048576 ))MB"
  elif (( bytes >= 1024 )); then
    echo "$(( bytes / 1024 ))KB"
  else
    echo "${bytes}B"
  fi
}

# ─── Pre-flight ────────────────────────────────────────────────────────────────
info "Backup target: ${OUTPUT_DIR}"

if $DRY_RUN; then
  info "[DRY RUN] Would check Postgres container is running"
  info "[DRY RUN] Would dump Postgres database 'interdict' → postgres.sql.gz"
  info "[DRY RUN] Would check ClickHouse container is running"
  info "[DRY RUN] Would list ClickHouse tables in database 'interdict'"
  info "[DRY RUN] Would dump each ClickHouse table → clickhouse/<table>.tsv.gz"
  info "[DRY RUN] No files written."
  exit 0
fi

check_container postgres
check_container clickhouse

mkdir -p "${OUTPUT_DIR}/clickhouse"

# ─── Postgres backup ──────────────────────────────────────────────────────────
info "Dumping Postgres database..."
docker compose exec -T postgres \
  pg_dump -U interdict interdict \
  | gzip > "${OUTPUT_DIR}/postgres.sql.gz"

PG_SIZE="$(file_size "${OUTPUT_DIR}/postgres.sql.gz")"
info "Postgres dump: ${OUTPUT_DIR}/postgres.sql.gz ($(human_size "$PG_SIZE"))"

# ─── ClickHouse backup ────────────────────────────────────────────────────────
info "Listing ClickHouse tables in database 'interdict'..."
TABLES=$(docker compose exec -T clickhouse \
  clickhouse-client --query "SELECT name FROM system.tables WHERE database = 'interdict' FORMAT TabSeparated" 2>/dev/null || true)

if [[ -z "$TABLES" ]]; then
  info "No tables found in ClickHouse database 'interdict' — skipping."
else
  while IFS= read -r table; do
    # Skip empty lines
    [[ -z "$table" ]] && continue
    info "Dumping ClickHouse table: interdict.${table}"
    docker compose exec -T clickhouse \
      clickhouse-client --query "SELECT * FROM interdict.${table} FORMAT TabSeparatedWithNames" 2>/dev/null \
      | gzip > "${OUTPUT_DIR}/clickhouse/${table}.tsv.gz"
  done <<< "$TABLES"
fi

# ─── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════"
echo "  Backup complete: ${OUTPUT_DIR}"
echo "═══════════════════════════════════════════"
echo ""

TOTAL_FILES=0
TOTAL_BYTES=0

for f in "${OUTPUT_DIR}"/*.gz "${OUTPUT_DIR}"/clickhouse/*.gz; do
  [[ -f "$f" ]] || continue
  SIZE="$(file_size "$f")"
  TOTAL_FILES=$(( TOTAL_FILES + 1 ))
  if [[ "$SIZE" != "?" ]]; then
    TOTAL_BYTES=$(( TOTAL_BYTES + SIZE ))
  fi
  printf "  %-50s %s\n" "${f}" "$(human_size "$SIZE")"
done

echo ""
echo "  Files: ${TOTAL_FILES}  |  Total: $(human_size ${TOTAL_BYTES})"
echo ""
