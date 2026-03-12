---
estimated_steps: 5
estimated_files: 3
---

# T03: Add git preferences to preferences.ts, template, and docs

**Slice:** S02 — Wire GitService into codebase
**Milestone:** M001

## Description

Add `git?: GitPreferences` to the `GSDPreferences` interface with full validation, merge semantics, documentation in the preferences template, and a reference doc entry. This enables all preference-gated git features in S05 (auto_push, merge guards, snapshots) via the existing preferences system.

The `GitPreferences` type already exists in `git-service.ts` — this task imports it and wires it into the preferences infrastructure.

## Steps

1. **Add `git` field to `GSDPreferences` interface:** Import `GitPreferences` from `./git-service.ts`. Add `git?: GitPreferences` to the `GSDPreferences` interface alongside the existing fields.

2. **Add git validation to `validatePreferences()`:** After the existing validation blocks, add a `git` section that validates each sub-field:
   - `auto_push`: must be boolean if present
   - `push_branches`: must be boolean if present
   - `remote`: must be non-empty string if present
   - `snapshots`: must be boolean if present
   - `pre_merge_check`: must be boolean or the string `"auto"` if present
   - `commit_type`: must be one of `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`, `build`, `style` if present
   Collect errors for invalid values. Copy valid values to `validated.git`.

3. **Add git merge to `mergePreferences()`:** Add `git: { ...(base.git ?? {}), ...(override.git ?? {}) }` to the merge return object. Override-wins for each field, same as `models` and `auto_supervisor`.

4. **Update preferences template:** Add a `git:` section to `src/resources/extensions/gsd/templates/preferences.md` showing all available fields with sensible defaults (empty/unset). Place it after the existing sections in the frontmatter block.

5. **Update preferences reference doc:** Add a "Git Preferences" section to `src/resources/extensions/gsd/docs/preferences-reference.md` documenting each field, its type, default value, and behavior. Include a YAML example.

## Must-Haves

- [ ] `GSDPreferences` interface includes `git?: GitPreferences`
- [ ] `GitPreferences` imported from `git-service.ts`
- [ ] `validatePreferences()` validates all 6 git sub-fields with type checking
- [ ] Invalid git values produce error messages (not silent drops)
- [ ] `mergePreferences()` merges git with override-wins semantics
- [ ] `templates/preferences.md` has `git:` section with all fields
- [ ] `docs/preferences-reference.md` documents git preferences
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run test` same baseline

## Verification

- `npx tsc --noEmit` — no errors
- `npm run test` — same pass/fail as baseline
- `grep 'git.*GitPreferences' src/resources/extensions/gsd/preferences.ts` — confirms field exists
- `grep -c 'auto_push\|push_branches\|pre_merge_check\|snapshots\|commit_type' src/resources/extensions/gsd/preferences.ts` — at least 5 (validation of each field)
- `grep 'git:' src/resources/extensions/gsd/templates/preferences.md` — confirms template section
- `grep -i 'git preferences\|git:' src/resources/extensions/gsd/docs/preferences-reference.md` — confirms docs section

## Observability Impact

- Signals added/changed: None — this adds schema infrastructure only. Preferences are parsed at load time; invalid values produce error strings in the `validatePreferences` return.
- How a future agent inspects this: Call `loadEffectiveGSDPreferences()` and check `.preferences.git` for parsed values. Validation errors are in the return tuple.
- Failure state exposed: Invalid git preference values are reported as strings in the `errors` array from `validatePreferences()` — callers already log these.

## Inputs

- `src/resources/extensions/gsd/preferences.ts` — `GSDPreferences` interface, `validatePreferences()`, `mergePreferences()`
- `src/resources/extensions/gsd/git-service.ts` — `GitPreferences` interface
- `src/resources/extensions/gsd/templates/preferences.md` — existing template
- `src/resources/extensions/gsd/docs/preferences-reference.md` — existing reference doc

## Expected Output

- `src/resources/extensions/gsd/preferences.ts` — `git?: GitPreferences` in interface, validation logic, merge logic
- `src/resources/extensions/gsd/templates/preferences.md` — `git:` section added to frontmatter
- `src/resources/extensions/gsd/docs/preferences-reference.md` — git preferences documented with example
