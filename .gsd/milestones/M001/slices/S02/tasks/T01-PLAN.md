---
estimated_steps: 5
estimated_files: 3
---

# T01: Convert worktree.ts to thin facade delegating to GitServiceImpl

**Slice:** S02 — Wire GitService into codebase
**Milestone:** M001

## Description

Convert `worktree.ts` from a standalone git-operations module into a thin facade that preserves all 10 exports but delegates git-mutation functions to `GitServiceImpl` from `git-service.ts`. Pure utility functions stay as-is. The `MergeSliceResult` type duplication is eliminated by re-exporting from `git-service.ts` using `export type` per D014.

The circular dependency between `git-service.ts` (imports pure functions from `worktree.ts`) and `worktree.ts` (imports `GitServiceImpl` from `git-service.ts`) is handled by lazy construction: `GitServiceImpl` is only instantiated inside function bodies at call-time, never at module-evaluation time. The pure functions consumed by `git-service.ts` are available immediately at module evaluation.

## Steps

1. **Replace `MergeSliceResult` with type re-export:** Remove the local `MergeSliceResult` interface definition in `worktree.ts` and replace with `export type { MergeSliceResult } from "./git-service.ts"` (per D014 — type-only re-export avoids ESM cycle issues). Verify this doesn't break any consumer.

2. **Add lazy GitServiceImpl cache:** Import `GitServiceImpl` from `git-service.ts`. Add a `let cachedService: GitServiceImpl | null = null` and a `function getService(basePath: string): GitServiceImpl` that creates or returns the cached instance with `{}` default prefs. Include a basePath-change guard that resets the cache if basePath changes between calls.

3. **Convert 6 git-mutation functions to delegate:** Replace the bodies of `getMainBranch`, `getCurrentBranch`, `ensureSliceBranch`, `autoCommitCurrentBranch`, `switchToMain`, `mergeSliceToMain` with calls to the corresponding `GitServiceImpl` methods via `getService(basePath)`. Keep all function signatures identical. For `autoCommitCurrentBranch(basePath, unitType, unitId)`, map to `svc.autoCommit(unitType, unitId)`. For `mergeSliceToMain`, the GitServiceImpl version uses `inferCommitType` instead of hardcoded `feat` — this is the intended R009 fix.

4. **Remove now-unused private code:** Delete the private `branchExists()` function and private `runGit()` function from `worktree.ts` — these are now handled by `GitServiceImpl` and `git-service.ts` respectively. Keep `isOnSliceBranch()` and `getActiveSliceBranch()` as-is (they use `getCurrentBranch` which now delegates). Keep all pure utility functions unchanged: `detectWorktreeName`, `getSliceBranchName`, `SLICE_BRANCH_RE`, `parseSliceBranch`.

5. **Run all test suites and fix any assertion mismatches:** Run `worktree.test.ts`, `worktree-integration.test.ts`, and `git-service.test.ts`. The worktree tests don't assert on `mergedCommitMessage` format, so the switch from hardcoded `feat(` to `inferCommitType` should be transparent. Verify `npm run build` passes.

## Must-Haves

- [ ] All 10 `worktree.ts` exports preserved with identical type signatures
- [ ] `MergeSliceResult` re-exported via `export type` from `git-service.ts` (per D014, no local duplicate)
- [ ] Lazy `GitServiceImpl` construction (call-time, not module-evaluation)
- [ ] BasePath-change guard on cached service
- [ ] No circular dependency crash at import time
- [ ] `worktree.test.ts` passes — all assertions
- [ ] `worktree-integration.test.ts` passes — all assertions
- [ ] `git-service.test.ts` passes — all assertions
- [ ] `npx tsc --noEmit` clean

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/worktree.test.ts` — all pass
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/worktree-integration.test.ts` — all pass
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/git-service.test.ts` — all pass
- `npx tsc --noEmit` — no errors
- `grep -c 'GitServiceImpl' src/resources/extensions/gsd/worktree.ts` — at least 1 (confirms delegation wiring)
- `grep 'export type.*MergeSliceResult' src/resources/extensions/gsd/worktree.ts` — exactly 1 (type re-export per D014)

## Observability Impact

- Signals added/changed: `mergeSliceToMain` now returns commits with inferred conventional types (via `inferCommitType`) instead of hardcoded `feat`. This is an intentional R009 fix, not a regression.
- How a future agent inspects this: `git log --oneline` after merge shows the inferred commit type. Run worktree test suites to verify delegation.
- Failure state exposed: `runGit` errors from `git-service.ts` include command, basePath, and stderr. Lazy init errors surface at first function call, not import time.

## Inputs

- `src/resources/extensions/gsd/git-service.ts` — `GitServiceImpl` class, `GitPreferences` interface, `MergeSliceResult` interface (from S01)
- `src/resources/extensions/gsd/worktree.ts` — 10 exports, private `branchExists`, private `runGit`, `MergeSliceResult` duplicate
- D014 — `export type { MergeSliceResult }` decision

## Expected Output

- `src/resources/extensions/gsd/worktree.ts` — thin facade: imports `GitServiceImpl`, lazy cache, 6 functions delegate, 4 pure functions unchanged, `MergeSliceResult` type re-exported
- `src/resources/extensions/gsd/tests/worktree.test.ts` — unchanged (no assertion format changes needed)
- `src/resources/extensions/gsd/tests/worktree-integration.test.ts` — unchanged (no assertion format changes needed)
