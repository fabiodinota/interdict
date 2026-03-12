# T03: 32-repo-quality-gates-infra-lint-coverage 03

**Slice:** S03 — **Milestone:** M005

## Description

Consolidate the local quality workflow around Husky and document the honest Windows + WSL execution model.

Purpose: satisfy `HR-OPS-02` without leaving developers with two conflicting hook systems or fake native-Windows Rust promises.
Output: active Husky pre-commit/pre-push hooks plus corrected helper scripts and docs.

## Must-Haves

- [ ] The repo has one coherent local hook story centered on the active Husky hook path.
- [ ] Pre-commit remains fast while adding staged infra coverage, and pre-push documents or automates the heavier Rust-in-WSL gate honestly.
- [ ] Repo docs no longer claim `.claude/hooks` is the active install path when Husky is the real git hook system.

## Files

- `.husky/pre-commit`
- `.husky/pre-push`
- `.claude/hooks/README.md`
- `.claude/hooks/pre-commit.sh`
- `.claude/hooks/pre-push.sh`
