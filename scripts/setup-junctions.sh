#!/usr/bin/env bash
# setup-junctions.sh
#
# Creates Windows junction points so that .pi/ and .claude/ tool directories
# transparently serve files from the single canonical .gsd/ directory.
#
# Run once after cloning on Windows:
#   bash scripts/setup-junctions.sh
#
# On Linux/macOS use symlinks instead (or skip — those tools read .gsd/ directly).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && { pwd -W 2>/dev/null || pwd; })"

echo "Setting up junctions in: $REPO_ROOT"

create_junction() {
  local link="$1"
  local target="$2"

  local abs_link="$REPO_ROOT/$link"
  local abs_target="$REPO_ROOT/$target"

  if [ -e "$abs_link" ] && [ ! -L "$abs_link" ]; then
    # It's a real directory (not a link/junction) — skip to avoid data loss
    echo "  SKIP  $link  (real directory exists — remove manually if intentional)"
    return
  fi

  # Remove existing junction/symlink
  [ -e "$abs_link" ] || [ -L "$abs_link" ] && rm -rf "$abs_link"

  if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
    # Windows: use mklink /J (junction, no admin required)
    local win_link
    local win_target
    win_link=$(cygpath -w "$abs_link" 2>/dev/null || echo "${abs_link//\//\\}")
    win_target=$(cygpath -w "$abs_target" 2>/dev/null || echo "${abs_target//\//\\}")
    cmd //c "mklink /J \"$win_link\" \"$win_target\"" > /dev/null
    echo "  JUNCTION  $link  →  $target"
  else
    # Linux/macOS: real symlink
    ln -s "$abs_target" "$abs_link"
    echo "  SYMLINK   $link  →  $target"
  fi
}

# Single canonical dir: .gsd/
# Junctions for each tool that expects files in their own namespaced path:

create_junction ".pi/agents"    ".gsd/agents"
create_junction ".claude/agents" ".gsd/agents"
create_junction ".claude/skills" ".gsd/skills"
create_junction ".claude/rules"  ".gsd/rules"
create_junction ".claude/hooks"  ".gsd/hooks"
create_junction ".claude/mcp"    ".gsd/mcp"

echo ""
echo "Done. All tool directories now point to .gsd/ as the single source of truth."
echo "Edit files in .gsd/ — changes are immediately visible to all tools."
