---
estimated_steps: 4
estimated_files: 1
---

# T02: Wire auto.ts to use GitServiceImpl via worktree.ts facade

**Slice:** S02 — Wire GitService into codebase
**Milestone:** M001

## Description

After T01 converts `worktree.ts` to a facade, all auto.ts calls already route through `GitServiceImpl` transparently. This task makes that explicit by creating a `GitServiceImpl` instance in auto.ts (for future direct usage by S05) and verifying all callsites work correctly through the facade. The instance is initialized after `basePath` is set, using git preferences from the preferences system.

Bootstrap git calls (`git rev-parse --git-dir`, `git init`, `git add -A .gsd .gitignore && git commit`) and idle detection (`git status --porcelain`) remain inline per milestone success criteria.

## Steps

1. **Add GitServiceImpl import and module-level variable:** Import `GitServiceImpl` and `GitPreferences` from `./git-service.ts`. Add `let gitService: GitServiceImpl | null = null;` at module level near the existing `let basePath = ""` declaration.

2. **Initialize GitServiceImpl after basePath is set:** In `startAutoMode()`, after `basePath = base` is set and after the git init/bootstrap block (line ~375), create the instance: `gitService = new GitServiceImpl(basePath, loadEffectiveGSDPreferences()?.preferences?.git ?? {})`. This must happen after the git repo is confirmed to exist. Note: `loadEffectiveGSDPreferences` is already imported in auto.ts.

3. **Verify all callsites compile and route correctly:** The 8 imports from `worktree.ts` remain unchanged — `autoCommitCurrentBranch`, `ensureSliceBranch`, `getCurrentBranch`, `getMainBranch`, `getSliceBranchName`, `parseSliceBranch`, `switchToMain`, `mergeSliceToMain`. These now delegate through the T01 facade. No call signature changes needed. Remove `getSliceBranchName` from imports if unused (line 65 — imported but not called in auto.ts).

4. **Verify build and tests pass:** Run `npx tsc --noEmit` and `npm run test` to confirm no regressions. The auto.ts changes are additive — existing behavior is preserved.

## Must-Haves

- [ ] `GitServiceImpl` imported from `git-service.ts`
- [ ] Module-level `gitService` variable initialized after `basePath` is set
- [ ] Instance created with git preferences from `loadEffectiveGSDPreferences()`
- [ ] Bootstrap git calls remain inline (lines 360-375)
- [ ] Idle detection `git status --porcelain` remains inline (line 2545)
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run test` same baseline (116 pass, 2 pre-existing failures)

## Verification

- `npx tsc --noEmit` — no errors
- `npm run test` — same pass/fail as baseline
- `grep -c 'GitServiceImpl' src/resources/extensions/gsd/auto.ts` — at least 1
- `grep -c 'new GitServiceImpl' src/resources/extensions/gsd/auto.ts` — exactly 1

## Observability Impact

- Signals added/changed: None — this task adds the instance but doesn't change runtime behavior (facade handles delegation)
- How a future agent inspects this: `grep GitServiceImpl src/resources/extensions/gsd/auto.ts` to confirm the instance exists
- Failure state exposed: If preferences loading fails, `?? {}` ensures default empty prefs — no crash

## Inputs

- `src/resources/extensions/gsd/auto.ts` — orchestrator with 8 worktree.ts imports and git callsites
- `src/resources/extensions/gsd/worktree.ts` — T01 facade (all function calls now route to GitServiceImpl)
- `src/resources/extensions/gsd/git-service.ts` — `GitServiceImpl` constructor takes `(basePath, prefs?)`
- T01 completion — facade must be in place before this task verifies routing

## Expected Output

- `src/resources/extensions/gsd/auto.ts` — added `GitServiceImpl` import, module-level `gitService` variable, initialization in `startAutoMode()` after basePath is set
