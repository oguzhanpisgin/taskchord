# AGENTS.md — taskchord (agent instructions)

- pnpm monorepo (Node 24, pnpm 11.19). Full gate: `pnpm validate` = `pnpm check` (biome) + `pnpm typecheck` + `pnpm test:unit` (vitest) + `pnpm build` + `pnpm test:extension`.
- Tests live beside the code as `*.test.ts` (vitest; discovery patterns in `vitest.config.ts`) plus `tests/quality-gates.guard.test.ts`, which guards the standard.
- Quality loop: `eng/quality/quality-gates.json` is the standard — sweep after every accepted merge + at least monthly, Boy Scout rule on every touched file. Writer/reviewer routing: `C:/Users/OP/.agents/skills/capability-router/SKILL.md`.
- Lane discipline: one lane = one worktree + one brief with a single deliverable; heartbeat + receipt per lane; the writer never commits/pushes and never verifies its own work.
