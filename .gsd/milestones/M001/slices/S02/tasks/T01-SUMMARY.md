---
id: T01
parent: S02
milestone: M001
provides:
  - worktree.ts thin facade delegating git-mutation functions to GitServiceImpl
  - MergeSliceResult type re-export from git-service.ts (D014)
  - Lazy GitServiceImpl cache with basePath-change guard
key_files:
  - src/resources/extensions/gsd/worktree.ts
key_decisions:
  - Lazy construction via getService() avoids circular dependency crash at module-evaluation time
  - isOnSliceBranch and getActiveSliceBranch kept as local functions using getCurrentBranch (which delegates) — no need to route through GitServiceImpl since they're pure regex checks on the branch name
patterns_established:
  - Lazy singleton GitServiceImpl cache with basePath-change guard for facade modules
observability_surfaces:
  - mergeSliceToMain now returns commits with inferred conventional types via inferCommitType (R009 fix)
  - smartStage() console.error fallback warning surfaces exclusion failures
  - runGit errors include command, basePath, and stderr
duration: 10m
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T01: Convert worktree.ts to thin facade delegating to GitServiceImpl

**Converted worktree.ts from standalone git module to thin facade — all 13 exports preserved, 6 git-mutation functions delegate to GitServiceImpl via lazy cache, MergeSliceResult re-exported per D014.**

## What Happened

1. Removed local `MergeSliceResult` interface, replaced with `export type { MergeSliceResult } from "./git-service.ts"` (D014 type-only re-export).
2. Added lazy `GitServiceImpl` cache: `cachedService`/`cachedBasePath` module-level variables with `getService(basePath)` factory that resets on basePath change. Construction happens at call-time only, never at module evaluation — avoids circular dependency crash.
3. Converted 6 git-mutation functions to delegate: `getMainBranch`, `getCurrentBranch`, `ensureSliceBranch`, `autoCommitCurrentBranch` (maps to `svc.autoCommit`), `switchToMain`, `mergeSliceToMain`. All function signatures identical.
4. Removed private `runGit()` and `branchExists()` — now handled by `GitServiceImpl` internals.
5. Kept pure utility functions unchanged: `detectWorktreeName`, `getSliceBranchName`, `SLICE_BRANCH_RE`, `parseSliceBranch`.
6. Kept `isOnSliceBranch` and `getActiveSliceBranch` as local functions that use `getCurrentBranch` (which delegates).

The circular dependency (git-service.ts imports pure functions from worktree.ts, worktree.ts imports GitServiceImpl from git-service.ts) works because GitServiceImpl is only instantiated inside function bodies at call-time, and the pure functions consumed by git-service.ts are available immediately at module evaluation.

## Verification

- `worktree.test.ts`: 56 passed, 0 failed ✓
- `worktree-integration.test.ts`: 40 passed, 0 failed ✓
- `git-service.test.ts`: 113 passed, 0 failed ✓
- `npx tsc --noEmit`: clean, no errors ✓
- `grep -c 'GitServiceImpl' worktree.ts` → 9 (confirms delegation wiring) ✓
- `grep 'export type.*MergeSliceResult' worktree.ts` → exactly 1 match ✓
- Consumer imports in state.ts, workspace-index.ts, worktree-command.ts unchanged ✓

### Slice-level verification (partial — T01 of 3):
- ✅ worktree.test.ts passes
- ✅ worktree-integration.test.ts passes
- ✅ git-service.test.ts passes
- ✅ npx tsc --noEmit clean
- ⏳ npm run test (full suite) — deferred to final task
- ✅ Consumer imports unchanged

## Diagnostics

- Run any of the three test suites to verify delegation is working
- `git log --oneline` after a merge shows inferred commit types (feat/fix/refactor/etc. instead of always feat)
- Lazy init errors surface at first function call, not import time — look for "git ... failed in ..." error messages

## Deviations

None. Plan executed as written.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/worktree.ts` — converted to thin facade: imports GitServiceImpl, lazy cache, 6 functions delegate, 4 pure functions unchanged, MergeSliceResult type re-exported
