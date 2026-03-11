#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

shopt -s globstar nullglob

usage() {
  cat <<'EOF'
Usage:
  scripts/quality/infra-check.sh            # full repo infra checks
  scripts/quality/infra-check.sh --staged   # staged infra checks
  scripts/quality/infra-check.sh <files...> # targeted infra checks
EOF
}

require_tool() {
  local tool="$1"
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf 'Missing required tool: %s\n' "$tool" >&2
    exit 1
  fi
}

is_dockerfile() {
  case "$1" in
    docker/*/Dockerfile|docker/*/Dockerfile.*) return 0 ;;
    *) return 1 ;;
  esac
}

is_shell_script() {
  case "$1" in
    *.sh) return 0 ;;
    *) return 1 ;;
  esac
}

is_proto_file() {
  case "$1" in
    proto/**/*.proto) return 0 ;;
    *) return 1 ;;
  esac
}

is_helm_file() {
  case "$1" in
    helm/interdict/*) return 0 ;;
    *) return 1 ;;
  esac
}

is_plain_yaml_file() {
  case "$1" in
    .github/workflows/*.yml|.github/workflows/*.yaml) return 0 ;;
    docker-compose.yml) return 0 ;;
    helm/interdict/Chart.yaml|helm/interdict/values*.yaml) return 0 ;;
    .hadolint.yaml|.yamllint.yml|buf.yaml) return 0 ;;
    *) return 1 ;;
  esac
}

render_helm_chart() {
  require_tool helm

  local tmp_chart
  tmp_chart="$(mktemp -d)"
  trap 'rm -rf "$tmp_chart"' RETURN

  cp -R helm/interdict/. "$tmp_chart"

  helm dependency build "$tmp_chart" >/dev/null
  helm lint "$tmp_chart"
  helm template interdict "$tmp_chart" >/dev/null
}

run_hadolint() {
  local -a files=("$@")
  if [ "${#files[@]}" -eq 0 ]; then
    return
  fi

  require_tool hadolint
  hadolint --config .hadolint.yaml "${files[@]}"
}

run_shellcheck() {
  local -a files=("$@")
  if [ "${#files[@]}" -eq 0 ]; then
    return
  fi

  require_tool shellcheck
  shellcheck "${files[@]}"
}

run_buf_lint() {
  local -a files=("$@")

  require_tool buf
  if [ "${#files[@]}" -eq 0 ]; then
    buf lint
    return
  fi

  local file
  for file in "${files[@]}"; do
    buf lint --path "$file"
  done
}

run_yamllint() {
  local -a files=("$@")
  if [ "${#files[@]}" -eq 0 ]; then
    return
  fi

  require_tool yamllint
  yamllint -c .yamllint.yml "${files[@]}"
}

mode="full"
declare -a explicit_files=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --staged)
      mode="staged"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --)
      shift
      while [ "$#" -gt 0 ]; do
        explicit_files+=("$1")
        shift
      done
      ;;
    *)
      mode="targeted"
      explicit_files+=("$1")
      shift
      ;;
  esac
done

declare -a dockerfiles=()
declare -a shell_scripts=()
declare -a proto_files=()
declare -a yaml_files=()
should_check_helm=false

if [ "$mode" = "full" ]; then
  dockerfiles=(docker/*/Dockerfile docker/*/Dockerfile.*)
  shell_scripts=(docker/**/*.sh scripts/**/*.sh .claude/hooks/*.sh)
  proto_files=(proto/**/*.proto)
  yaml_files=(.github/workflows/*.yml .github/workflows/*.yaml docker-compose.yml helm/interdict/Chart.yaml helm/interdict/values*.yaml .hadolint.yaml .yamllint.yml buf.yaml)
  should_check_helm=true
else
  if [ "$mode" = "staged" ]; then
    mapfile -t explicit_files < <(git diff --cached --name-only --diff-filter=ACMR)
  fi

  local_file=""
  for local_file in "${explicit_files[@]}"; do
    if [ ! -e "$local_file" ]; then
      continue
    fi

    if is_dockerfile "$local_file"; then
      dockerfiles+=("$local_file")
    fi
    if is_shell_script "$local_file"; then
      shell_scripts+=("$local_file")
    fi
    if is_proto_file "$local_file"; then
      proto_files+=("$local_file")
    fi
    if is_plain_yaml_file "$local_file"; then
      yaml_files+=("$local_file")
    fi
    if is_helm_file "$local_file"; then
      should_check_helm=true
    fi
  done
fi

if [ "$mode" != "full" ] && [ "${#dockerfiles[@]}" -eq 0 ] && [ "${#shell_scripts[@]}" -eq 0 ] && [ "${#proto_files[@]}" -eq 0 ] && [ "${#yaml_files[@]}" -eq 0 ] && [ "$should_check_helm" = false ]; then
  printf 'No infra files selected for checking.\n'
  exit 0
fi

printf 'Running infra quality checks (%s mode)\n' "$mode"

run_hadolint "${dockerfiles[@]}"
run_shellcheck "${shell_scripts[@]}"

if [ "$mode" = "full" ]; then
  run_buf_lint
elif [ "${#proto_files[@]}" -gt 0 ]; then
  run_buf_lint "${proto_files[@]}"
fi

if [ "$should_check_helm" = true ]; then
  render_helm_chart
fi

run_yamllint "${yaml_files[@]}"

printf 'Infra quality checks completed successfully.\n'
