# S02: Wire GitService into codebase

**Goal:** All git-mutation functions in `worktree.ts` delegate to `GitServiceImpl`. `auto.ts` creates a `GitServiceImpl` instance and routes its git calls through it. `preferences.ts` exposes `git?: GitPreferences` with validation, merge, and documentation.

**Demo:** `npm run build` passes. All three test suites pass: `worktree.test.ts`, `worktree-integration.test.ts`, `git-service.test.ts`. All 6+ consumers of `worktree.ts` continue to import and call functions without changes.

## Must-Haves

- All 10 `worktree.ts` exports preserved with identical signatures
- `worktree.ts` git-mutation functions (`getMainBranch`, `getCurrentBranch`, `ensureSliceBranch`, `autoCommitCurrentBranch`, `switchToMain`, `mergeSliceToMain`) delegate to `GitServiceImpl` internally
- `MergeSliceResult` re-exported via `export type` from `git-service.ts` (eliminate type duplication per D014)
- No circular dependency crash at module-evaluation time between `worktree.ts` and `git-service.ts`
- `auto.ts` creates `GitServiceImpl` instance with `basePath` and git preferences after `basePath` is set
- `auto.ts` callsites for `autoCommitCurrentBranch`, `ensureSliceBranch`, `switchToMain`, `mergeSliceToMain` route through GitService (via worktree.ts facade)
- `GSDPreferences` interface includes `git?: GitPreferences` field
- `validatePreferences()` validates git sub-fields
- `mergePreferences()` merges git preferences with override semantics
- `templates/preferences.md` documents git section
- `docs/preferences-reference.md` documents git preferences
- Existing tests pass without regressions

## Proof Level

- This slice proves: integration
- Real runtime required: no (existing test suites with temp git repos exercise the full contract)
- Human/UAT required: no

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/worktree.test.ts` — all pass
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/worktree-integration.test.ts` — all pass
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/git-service.test.ts` — all pass
- `npx tsc --noEmit` — clean (no errors)
- `npm run test` — same pass/fail as baseline (116 pass, 2 pre-existing failures)
- `grep -n 'import.*from.*worktree' src/resources/extensions/gsd/state.ts src/resources/extensions/gsd/workspace-index.ts src/resources/extensions/gsd/worktree-command.ts` — unchanged, still importing from worktree.ts

## Observability / Diagnostics

- Runtime signals: `mergeSliceToMain` now returns commit messages with inferred conventional types (via `inferCommitType`) instead of hardcoded `feat`. `console.error` warning from `smartStage()` fallback signals exclusion failure.
- Inspection surfaces: Re-run any of the three test suites to verify delegation is working. `git log --oneline` after merge shows inferred commit types.
- Failure visibility: `runGit` errors include full command, basePath, and stderr. Lazy `GitServiceImpl` construction errors surface at first call, not module load.
- Redaction constraints: none (no secrets involved)

## Integration Closure

- Upstream surfaces consumed: `git-service.ts` → `GitServiceImpl`, `GitPreferences`, `MergeSliceResult`, all public methods (from S01)
- New wiring introduced in this slice: `worktree.ts` facade delegates to `GitServiceImpl`; `auto.ts` creates `GitServiceImpl` instance from `basePath` + preferences; `preferences.ts` exposes `git` field in `GSDPreferences`
- What remains before the milestone is truly usable end-to-end: S03 (bug fixes), S04 (remove git from prompts), S05 (enhanced features), S06 (cleanup/archive)

## Tasks

- [x] **T01: Convert worktree.ts to thin facade delegating to GitServiceImpl** `est:45m`
  - Why: Core integration task — all 6+ consumers depend on worktree.ts exports being stable while internals switch to GitServiceImpl. Satisfies R005 (facade delegation) and R009 (inferCommitType replaces hardcoded feat).
  - Files: `src/resources/extensions/gsd/worktree.ts`, `src/resources/extensions/gsd/tests/worktree.test.ts`, `src/resources/extensions/gsd/tests/worktree-integration.test.ts`
  - Do: Import `GitServiceImpl`, `GitPreferences`, and re-export `MergeSliceResult` via `export type` (per D014) from `git-service.ts`. Add lazy `GitServiceImpl` cache with basePath-change guard. Convert 6 git-mutation functions to delegate. Remove unused private `branchExists` and `runGit`. Keep 4 pure functions and query functions unchanged. Run tests and fix any assertion mismatches.
  - Verify: All three test suites pass. `npx tsc --noEmit` clean. No consumer import changes needed.
  - Done when: `worktree.ts` delegates to `GitServiceImpl` for all git-mutation functions, all tests green, build clean.

- [x] **T02: Wire auto.ts to use GitServiceImpl via worktree.ts facade** `est:30m`
  - Why: auto.ts is the primary orchestrator — it must have a `GitServiceImpl` instance for future direct usage and verify all callsites work through the T01 facade. Satisfies R006.
  - Files: `src/resources/extensions/gsd/auto.ts`
  - Do: Import `GitServiceImpl` and `GitPreferences` from `git-service.ts`. Add module-level `gitService` variable. Initialize after `basePath` is set in `startAutoMode()` using git preferences from `loadEffectiveGSDPreferences()`. Keep bootstrap git calls and idle detection inline per spec. Verify build and tests.
  - Verify: `npx tsc --noEmit` clean. `npm run test` same baseline. `grep -c 'new GitServiceImpl' src/resources/extensions/gsd/auto.ts` shows 1.
  - Done when: auto.ts has a `GitServiceImpl` instance created from preferences, build clean, tests pass.

- [x] **T03: Add git preferences to preferences.ts, template, and docs** `est:30m`
  - Why: Preferences schema is needed for S05 features (auto_push, merge guards, snapshots) and must exist before those slices. Satisfies R004.
  - Files: `src/resources/extensions/gsd/preferences.ts`, `src/resources/extensions/gsd/templates/preferences.md`, `src/resources/extensions/gsd/docs/preferences-reference.md`
  - Do: Add `git?: GitPreferences` to `GSDPreferences` interface (import from `git-service.ts`). Add git validation in `validatePreferences()` for all 6 sub-fields. Add git merge in `mergePreferences()` with override-wins semantics. Add `git:` section to preferences template. Document git preferences in reference doc.
  - Verify: `npx tsc --noEmit` clean. `npm run test` same baseline. `grep 'git.*GitPreferences' src/resources/extensions/gsd/preferences.ts` confirms field.
  - Done when: `GSDPreferences.git` field exists with full validation, merge, template, and reference doc.

## Files Likely Touched

- `src/resources/extensions/gsd/worktree.ts`
- `src/resources/extensions/gsd/auto.ts`
- `src/resources/extensions/gsd/preferences.ts`
- `src/resources/extensions/gsd/git-service.ts` (minor — only if re-export adjustments needed)
- `src/resources/extensions/gsd/templates/preferences.md`
- `src/resources/extensions/gsd/docs/preferences-reference.md`
- `src/resources/extensions/gsd/tests/worktree.test.ts` (assertion updates if needed)
- `src/resources/extensions/gsd/tests/worktree-integration.test.ts` (assertion updates if needed)
