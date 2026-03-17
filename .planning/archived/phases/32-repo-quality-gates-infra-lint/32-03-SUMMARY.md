# Plan 32-03 Summary

- Made Husky the single active local hook path by updating `.husky/pre-commit` to run `lint-staged` plus staged infra checks, and by adding `.husky/pre-push` for the heavier full infra and WSL-backed Rust gates.
- Reworked `.claude/hooks/pre-commit.sh` and `.claude/hooks/pre-push.sh` into helper entry points that mirror the Husky behavior instead of competing with it.
- Rewrote `.claude/hooks/README.md` so it now documents the actual Husky-first workflow, the Windows + WSL Rust expectation, and the fact that local infra hooks fail loudly when required CLIs are missing.
- Verified structurally with content checks on the Husky hooks and README, plus smoke tests that showed the staged infra command no-ops cleanly when no infra files are selected and the WSL wrapper reports an honest unavailable-WSL error on this host.

Key files:
- `.husky/pre-commit`
- `.husky/pre-push`
- `.claude/hooks/pre-commit.sh`
- `.claude/hooks/pre-push.sh`
- `.claude/hooks/README.md`
