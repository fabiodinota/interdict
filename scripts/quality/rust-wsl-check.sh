#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

run_cargo_gates() {
  cargo fmt --all -- --check
  cargo clippy --workspace --all-targets -- -D warnings
  cargo test -p evidence-collector --all-targets -- --test-threads=1
  cargo test --workspace --lib --tests --bins --exclude evidence-collector -- --skip policy_pipeline::test_rego_policy_evaluates_under_2ms
  cargo test -p kernel --test integration_tests policy_pipeline::test_rego_policy_evaluates_under_2ms -- --exact --nocapture
  cargo test -p kernel --test content_inspection_test

  if command -v cargo-audit >/dev/null 2>&1; then
    cargo audit
  else
    printf 'cargo-audit is not installed; skipping optional audit gate.\n'
  fi
}

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    if ! command -v wsl.exe >/dev/null 2>&1; then
      printf 'WSL is required for Rust verification on this Windows host, but wsl.exe is unavailable.\n' >&2
      exit 1
    fi

    WSL_DISTRO="${INTERDICT_WSL_DISTRO:-Ubuntu-24.04}"

    if command -v cygpath >/dev/null 2>&1; then
      WINDOWS_ROOT="$(cygpath -m "$ROOT_DIR")"
    else
      WINDOWS_ROOT="$ROOT_DIR"
    fi

    if ! wsl.exe -d "$WSL_DISTRO" bash -lc "true" >/dev/null 2>&1; then
      printf 'WSL distro %s is unavailable on this host. Repair the WSL environment or set INTERDICT_WSL_DISTRO and retry Rust verification.\n' "$WSL_DISTRO" >&2
      exit 1
    fi

    WSL_ROOT="$(wsl.exe -d "$WSL_DISTRO" wslpath -a "$WINDOWS_ROOT" | tr -d '\r')"
    if [ -z "$WSL_ROOT" ]; then
      printf 'Unable to resolve the repository path inside WSL.\n' >&2
      exit 1
    fi

    printf 'Running Rust verification through WSL distro %s at %s\n' "$WSL_DISTRO" "$WSL_ROOT"
    wsl.exe -d "$WSL_DISTRO" bash -lc "set -euo pipefail && cd \"$WSL_ROOT\" && cargo fmt --all -- --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test -p evidence-collector --all-targets -- --test-threads=1 && cargo test --workspace --lib --tests --bins --exclude evidence-collector -- --skip policy_pipeline::test_rego_policy_evaluates_under_2ms && cargo test -p kernel --test integration_tests policy_pipeline::test_rego_policy_evaluates_under_2ms -- --exact --nocapture && cargo test -p kernel --test content_inspection_test && if command -v cargo-audit >/dev/null 2>&1; then cargo audit; else echo 'cargo-audit is not installed in WSL; skipping optional audit gate.'; fi"
    ;;
  *)
    printf 'Running Rust verification natively (non-Windows host).\n'
    run_cargo_gates
    ;;
esac
