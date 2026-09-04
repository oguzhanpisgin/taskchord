# DEC-001: Adopt the Quality Gates quality loop

- **Date:** 2026-09-04
- **Status:** accepted (owner-approved rollout)
- **Supersedes:** nothing (first decision record in this repo; this file starts the append-only `docs/decisions/` ledger — changes to a decision are recorded as a new file referencing the old id)

## Decision

taskchord adopts the Quality Gates discipline: five gates (static analysis, clean-code standards,
tech-debt management, performance budget, continuous security scanning) plus the Boy Scout Rule.
The standard's single source of truth is `eng/quality/quality-gates.json`; the drift-guard tests in
`tests/quality-gates.guard.test.ts` read it and fail on drift against `package.json` scripts and the
discovered vitest suite. Sweeps run after every accepted merge and at least monthly. Writer/reviewer
selection follows the capability-router skill.

## Consequences

- Changes to `eng/quality/quality-gates.json` require a new decision record in this ledger.
- Existing code is held to the same gates as new code, package-by-package in bounded slices.
- Deferred items are recorded in the rollout receipt with explicit re-entry triggers, never silently dropped.
