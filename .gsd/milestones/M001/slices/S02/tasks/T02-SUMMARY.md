---
id: T02
parent: S02
milestone: M001
provides:
  - GitServiceImpl instance in auto.ts initialized from basePath + git preferences
  - Removed unused getSliceBranchName import from auto.ts
key_files:
  - src/resources/extensions/gsd/auto.ts
key_decisions:
  - Initialize gitService after bootstrap block (git init + .gsd mkdir) but before crash-lock check — ensures git repo exists
  - Use `loadEffectiveGSDPreferences()?.preferences?.git ?? {}` for safe fallback to empty prefs
patterns_established:
  - Module-level `gitService` variable with post-init construction in startAutoMode()
observability_surfaces:
  - If preferences loading fails, `?? {}` ensures default empty prefs — no crash. gitService null before startAutoMode() runs.
duration: 8m
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T02: Wire auto.ts to use GitServiceImpl via worktree.ts facade

**Added GitServiceImpl instance in auto.ts, initialized after basePath is set with git preferences from the preferences system. Removed unused `getSliceBranchName` import.**

## What Happened

Three changes to `auto.ts`:
1. Added imports for `GitServiceImpl` and `GitPreferences` from `git-service.ts`
2. Added module-level `let gitService: GitServiceImpl | null = null` next to the existing `basePath` declaration
3. Added initialization line after the bootstrap block in `startAutoMode()`: `gitService = new GitServiceImpl(basePath, loadEffectiveGSDPreferences()?.preferences?.git ?? {})`
4. Removed `getSliceBranchName` from the worktree.ts import list — it was imported but never used in auto.ts

All 8 remaining worktree.ts imports continue to work through the T01 facade unchanged. Bootstrap git calls and idle detection remain inline per spec.

## Verification

- `npx tsc --noEmit` — clean, no errors
- `npm run test` — 116 pass, 2 pre-existing failures (matches baseline)
- `grep -c 'GitServiceImpl' auto.ts` → 4 (import, type import, variable declaration, instantiation)
- `grep -c 'new GitServiceImpl' auto.ts` → 1 (exactly one instantiation)
- All three test suites pass: worktree.test.ts, worktree-integration.test.ts, git-service.test.ts
- Consumer imports unchanged: state.ts, workspace-index.ts, worktree-command.ts still import from worktree.ts

## Diagnostics

- `grep GitServiceImpl src/resources/extensions/gsd/auto.ts` confirms instance exists
- `gitService` is null before `startAutoMode()` runs — any premature access will surface as TypeError
- Preferences fallback `?? {}` means no crash even if preferences file is missing or malformed

## Deviations

Removed unused `getSliceBranchName` import as noted in the plan (step 3). This is a cleanup, not a behavioral change.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/auto.ts` — Added GitServiceImpl import, module-level variable, initialization in startAutoMode(), removed unused getSliceBranchName import
