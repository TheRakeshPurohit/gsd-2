# GSD2 Git Strategy: Cross-Model Synthesis

> Three AI models (Claude, Codex, Gemini) independently audited GSD2's git workflow and proposed improvements. This document synthesizes their findings into a single authoritative analysis: what GSD2 does, what's broken, what the best teams do, and exactly what to build.

---

## Source Audit Quality Assessment

| Model | Approach | Verdict |
|-------|----------|---------|
| **Codex** | Read every relevant source file. Cited specific line numbers. Found real bugs. Strongest architectural insight. | **Best audit. Primary source for architecture decisions.** |
| **Claude** | Thorough analysis with copy-paste-ready implementation code. Best structured for execution. | **Best audit for implementation specs. Secondary source.** |
| **Gemini** | No evidence of reading source code. No file paths or line numbers. Marketing language. | **Weakest audit. Two usable ideas extracted; rest discarded.** |

---

## Part 1: What GSD2 Does Today

All three audits agree on the current architecture. The ground truth:

### Core Git Files

| File | Role |
|------|------|
| `src/resources/extensions/gsd/worktree.ts` | Slice branch lifecycle: create, checkout, merge, delete |
| `src/resources/extensions/gsd/worktree-manager.ts` | Git worktree lifecycle: create, list, diff, merge, remove |
| `src/resources/extensions/gsd/auto.ts` | Orchestrator: ensures branches at dispatch, merges after slice completion |
| `src/resources/extensions/gsd/session-forensics.ts` | Crash recovery: captures git state for session restoration |

### Branch Naming

| Context | Pattern | Example |
|---------|---------|---------|
| Slice branch (main tree) | `gsd/<milestoneId>/<sliceId>` | `gsd/M001/S01` |
| Slice branch (worktree) | `gsd/<worktreeName>/<milestoneId>/<sliceId>` | `gsd/alpha/M001/S01` |
| Worktree base branch | `worktree/<name>` | `worktree/alpha` |

### What Works

All three audits confirm GSD2 is **already in the top tier** of agentic git implementations:

- **Branch-per-slice isolation** — each slice gets its own branch, main stays clean
- **Squash merge to trunk** — one commit per slice on main, individually revertable
- **Worktree support with namespace isolation** — parallel agents can't collide
- **Auto-commit safety nets** — dirty state never blocks branch operations
- **Merge guard in auto mode** — completed slices auto-merge before next dispatch

### What Does Not Exist

| Capability | Status |
|-----------|--------|
| `git push` | Zero remote operations anywhere in codebase |
| Pre-merge build/test verification | None — merge is blind |
| Git preferences/config surface | None — zero user-configurable git behavior |
| PR creation | None — local-only workflow |
| Commit type inference | None — everything is `feat(...)` |
| Git tags/releases | None |
| Commit signing | None |
| Stash operations | None — auto-commit philosophy instead |

---

## Part 2: Confirmed Bugs and Mismatches

These are real defects found across audits, verified against actual source code.

### Bug 1: Docs Say Branches Preserved; Code Deletes Them

**Found by**: Codex (with line numbers), Claude (without)

- README says `gsd/M001/S01 (preserved)` — `README.md` lines 258-264
- Workflow doc says "Branch kept" — `src/resources/GSD-WORKFLOW.md` lines 548-551
- Implementation calls `git branch -D` after squash merge — `worktree.ts` line 261

**Resolution**: Update docs to match behavior. Branches are deleted after merge. This is correct behavior (see Design Decision 2 below).

### Bug 2: Checkpoint Commits Are Documented but Not Enforced

**Found by**: Codex

- Workflow doc describes explicit checkpoint commits before each task — `GSD-WORKFLOW.md` lines 565-580
- No enforcement exists in auto mode or prompts
- System relies on the LLM remembering to commit and on broad fallback auto-commits

**Resolution**: Replace documented checkpoint model with hidden snapshot refs (see Priority 3 below).

### Bug 3: `git add -A` Stages Everything Indiscriminately

**Found by**: Codex

- `worktree.ts` lines 187-190 and 208-214 use `git add -A` as fallback
- Can accidentally commit unrelated user edits, generated files, partial experiments, dirt from failed attempts

**Resolution**: Implement scoped file ownership (see Priority 2 below).

### Bug 4: Squash Commit Type Is Always `feat`

**Found by**: Codex

- `worktree.ts` lines 258-260 hardcodes `feat(M###/S##): <slice title>`
- Bugfix slices, docs slices, refactor slices all mislabeled as `feat`

**Resolution**: Infer commit type from slice metadata (see Priority 5 below).

### Bug 5: Worktree Create Commits After Fork, Not Before

**Found by**: Codex

- `worktree-command.ts` lines 352-357: creates worktree first, then auto-commits dirty state
- New worktree forks from pre-commit HEAD rather than the user's saved state

**Resolution**: Swap ordering — commit dirty state before creating the worktree.

### Bug 6: Worktree Merge Uses LLM Instead of Existing Deterministic Helper

**Found by**: Codex

- Deterministic typed helper exists: `worktree-manager.ts` lines 375-391
- `/worktree merge` dispatches an LLM-driven flow instead: `worktree-command.ts` lines 672-696

**Resolution**: Use the deterministic helper as the default path. Fall back to LLM-mediated merge only for complex planning artifact reconciliation.

### Bug 7: Slice Branches Can Fork From Stale/Non-Trunk Base

**Found by**: Codex

- `worktree.ts` lines 161-170: may branch from current non-slice branch instead of repo default
- Added pragmatically (preserving planning artifacts on working branch) but violates trunk-first discipline

**Resolution**: When remote exists, fetch before branching. Always prefer true trunk HEAD as base.

---

## Part 3: What The Best Teams Do (2026 Consensus)

All three audits converge on the same industry picture. Disagreements are noted.

### Universal Agreement

| Practice | Status | GSD2 |
|----------|--------|------|
| Trunk-based development | Industry standard | **Already doing this** |
| Short-lived feature branches | Consensus winner | **Already doing this** (slice branches) |
| Squash merge to main | Standard for feature branches | **Already doing this** |
| GitFlow | Dead | **Already avoiding** |
| Permanent `develop` branch | Anti-pattern | **Already avoiding** |
| Pre-merge verification | Table stakes | **Not doing this** |
| Remote backup | Expected by professionals | **Not doing this** |
| Clean, parseable commit history | Universal expectation | **Partially — type is always `feat`** |

### Where Audits Disagree

| Topic | Codex | Claude | Gemini | Synthesis Verdict |
|-------|-------|--------|--------|-------------------|
| **Preserve merged branches** | Delete (correct) | Preserve (wrong) | Delete | **Delete.** The squash commit IS the record. Branches are work-in-progress scaffolding. Preserving them creates sprawl with near-zero debugging value — `git bisect` on main at feature granularity covers 99% of cases. |
| **Hidden snapshot refs** | Yes — `refs/gsd/snapshots/...` | Not proposed | Not proposed | **Yes.** Recovery points should be invisible infrastructure, not noisy checkpoint commits. |
| **Git operations in prompts vs code** | Move to deterministic code (critical) | Not identified as issue | Not identified | **Move to code.** This is the single most important architectural change. Git is deterministic; LLMs are probabilistic. Wrong trust boundary. |
| **Scoped file ownership** | Yes — track owned files per unit | Not proposed | Not proposed | **Yes.** `git add -A` in an agentic system is a liability. Commit only files the unit touched. |
| **Git Notes for metadata** | Not proposed | Not proposed | Yes — store task plans, verification in notes | **No.** Git Notes are fragile, poorly supported by most tools, don't survive typical push/pull workflows. Use commit trailers and GSD artifacts instead. |
| **Shadow worktrees as default** | Worktrees as automatic infrastructure | Not proposed | Yes — agent always works in shadow worktree | **Not as default.** Adds complexity for the common single-agent case. Auto-create worktrees when parallelism is detected, not by default. |
| **Stacked branches/PRs** | Advanced mode, opt-in | Not proposed | Proposed as core model | **Opt-in only.** Stacked changes are powerful for multi-agent and large refactors. They are over-engineering for a solo vibe coder doing one slice at a time. |
| **PR / merge queue awareness** | Yes — detect and participate in host policy | PR on milestone completion only | PR on "ship" command | **Codex has the right model.** Per-slice PRs when remote has protected trunk. Per-milestone PRs are too coarse. |
| **Feature flags** | Recommended for large features | Not proposed | Not proposed | **Out of scope for GSD's git layer.** Good practice, but GSD manages work orchestration, not application architecture. |

---

## Part 4: The GSD2 Git Philosophy

One sentence: **GSD2 is trunk-based by default, branch-per-slice always, verification-gated before merge, deterministic for every mechanical git operation, and policy-aware when a remote exists.**

### Five Design Rules

**Rule 1: Trunk is the source of truth.**
The repo's default branch is the integration branch. No `develop`. No shadow trunks. Every slice branches from it and merges back to it.

**Rule 2: Slice branches are the unit of work.**
The `gsd/M001/S01` pattern is the right abstraction. Branches are short-lived, isolated, and disposable after merge. The squash commit on main is the permanent record.

**Rule 3: Git mechanics are deterministic code, not LLM prose.**
The LLM decides what changed, why, and whether work is complete. The program decides what gets staged, committed, branched, merged, pushed, and cleaned up. This is the most important trust boundary in GSD2's architecture.

**Rule 4: Recovery is invisible infrastructure.**
Hidden snapshot refs (`refs/gsd/snapshots/...`) before risky operations. Auto-rollback on failure. No visible checkpoint commits cluttering branch history. Senior-grade recovery without novice-facing noise.

**Rule 5: Remote workflow is policy-aware.**
No remote? Local squash-to-main works perfectly. Remote with protected trunk? Detect it, push the branch, open the PR, participate in merge queue. The user's hosting setup determines the workflow, not manual configuration.

### Design Decisions (Resolved Disagreements)

**Decision 1: Delete merged slice branches.**
Codex is correct. The squash commit on main is the permanent record. Branch history is work-in-progress detail that rarely justifies the sprawl of keeping branches. Users who want preservation can opt in via preferences.

**Decision 2: No Git Notes.**
Gemini's proposal is rejected. Git Notes are fragile, poorly rendered by most tools, and have unreliable push/pull semantics. Commit message bodies (with task lists and branch references) plus GSD's own artifact files are more durable and more accessible.

**Decision 3: Worktrees are automatic infrastructure, not the default execution model.**
When GSD detects parallel agents, CI-wait scenarios, or risky spikes, it creates worktrees automatically. Single-agent execution in the main tree is fine for the common case. `/worktree` remains as an advanced manual escape hatch.

**Decision 4: Stacked branches are opt-in advanced mode.**
Auto-triggered when GSD detects benefit (many tasks, multiple independent sub-problems, high review surface). Not the default model for solo/vibe coder workflows.

---

## Part 5: Prioritized Implementation Plan

### P0: Fix The Trust Boundary (Ship-Blocking)

#### 1. Move Git Mechanics Out of Prompts Into Code

**Source**: Codex (primary architectural insight)

Create a deterministic Git service layer. The LLM never runs raw `git add`, `git commit`, `git checkout`, `git merge`, or `git push`. Instead:

```typescript
// New: src/resources/extensions/gsd/git-service.ts

interface GitService {
  /** Cut a slice branch from fresh trunk HEAD */
  beginSliceBranch(basePath: string, milestoneId: string, sliceId: string): SliceBranchResult;

  /** Create hidden snapshot ref before risky operation */
  createSnapshot(basePath: string, branch: string, unit: string): SnapshotRef;

  /** Stage and commit only files owned by the current unit */
  commitOwnedChanges(basePath: string, files: string[], message: string): CommitResult;

  /** Park unrelated dirty files safely (stash or WIP branch) */
  parkForeignDirtyState(basePath: string, ownedFiles: string[]): ParkResult;

  /** Run merge guard, squash merge, optionally push and PR */
  completeSliceMerge(basePath: string, options: MergeOptions): MergeResult;

  /** Rollback to snapshot ref */
  rollbackToSnapshot(basePath: string, ref: SnapshotRef): void;
}
```

**Files to modify**:
- `src/resources/extensions/gsd/worktree.ts` — extract git operations into service
- `src/resources/extensions/gsd/auto.ts` — call service instead of inline git
- `src/resources/extensions/gsd/prompts/execute-task.md` — remove `git add -A && git commit` instructions
- `src/resources/extensions/gsd/prompts/complete-slice.md` — remove raw git instructions
- `src/resources/extensions/gsd/prompts/replan-slice.md` — remove raw git instructions

**What the LLM provides to the service**: a commit message string and a "work complete" boolean. The service handles everything else.

#### 2. Replace `git add -A` With Scoped File Ownership

**Source**: Codex

Track which files a unit has created or modified. Commit only those files. If unrelated dirty files exist, park them.

```typescript
interface UnitFileOwnership {
  /** Files the agent created or modified during this unit */
  owned: string[];
  /** GSD bookkeeping files (always allowed) */
  bookkeeping: string[];
}

function commitOwnedChanges(basePath: string, ownership: UnitFileOwnership, message: string): void {
  const allOwned = [...ownership.owned, ...ownership.bookkeeping];

  // Check for foreign dirty files
  const allDirty = getDirtyFiles(basePath);
  const foreign = allDirty.filter(f => !allOwned.includes(f));

  if (foreign.length > 0) {
    parkForeignDirtyState(basePath, foreign);
  }

  // Stage only owned files
  for (const file of allOwned) {
    runGit(basePath, ["add", file]);
  }

  runGit(basePath, ["commit", "-m", message]);
}
```

**Fallback**: If ownership tracking fails or the unit didn't report files, fall back to `git add -A` with a warning logged. Pragmatism over purity — the system should never block on a tracking failure.

#### 3. Replace Checkpoint Commits With Hidden Snapshot Refs

**Source**: Codex

```typescript
function createSnapshot(basePath: string, branch: string, unit: string): string {
  const timestamp = Date.now();
  const refName = `refs/gsd/snapshots/${branch}/${unit}/${timestamp}`;
  const head = runGit(basePath, ["rev-parse", "HEAD"]).trim();
  runGit(basePath, ["update-ref", refName, head]);
  return refName;
}

function rollbackToSnapshot(basePath: string, ref: string): void {
  const target = runGit(basePath, ["rev-parse", ref]).trim();
  runGit(basePath, ["reset", "--hard", target]);
}

function pruneOldSnapshots(basePath: string, maxAge: number = 7 * 24 * 60 * 60 * 1000): void {
  // Delete snapshot refs older than maxAge
  // Implementation: list refs/gsd/snapshots/**, parse timestamps, delete old ones
}
```

**When to snapshot**: before each task execution, before merge, before any destructive operation.

**When to prune**: on `gsd:cleanup`, on milestone completion, or after 7 days.

### P0.5: Fix Confirmed Bugs

#### 4. Fix Worktree Create Ordering

**Source**: Codex (`worktree-command.ts` lines 352-357)

Swap the order: auto-commit dirty state **before** creating the worktree, so the new worktree forks from the committed state.

#### 5. Use Deterministic Worktree Merge Helper

**Source**: Codex (`worktree-manager.ts` lines 375-391 vs `worktree-command.ts` lines 672-696)

Wire `/worktree merge` to use the existing typed helper as the default path. Keep the LLM-mediated path as a fallback for cases with complex planning artifact reconciliation.

#### 6. Align Docs With Behavior

**Source**: Codex

Fix mismatches in README.md and GSD-WORKFLOW.md:
- Branch preservation: docs say preserved, code deletes → update docs to say deleted
- Checkpoint commits: docs promise them, code doesn't enforce → update docs to describe snapshot refs
- Merge behavior: document exact squash merge semantics

### P1: Merge Guards and Commit Quality

#### 7. Pre-Merge Verification (Merge Guards)

**Source**: Claude (implementation), Codex (framing)

Before committing a squash merge to main, run a verification command. If it fails, abort the merge and return to the slice branch.

```typescript
function detectMergeGuardCommand(basePath: string): string | null {
  // package.json: prefer typecheck + test, fall back to test, fall back to build
  const pkgPath = join(basePath, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const scripts = pkg.scripts ?? {};
    if (scripts.typecheck && scripts.test) return "npm run typecheck && npm run test";
    if (scripts.test) return "npm run test";
    if (scripts.build) return "npm run build";
  }

  // Cargo.toml → cargo test
  if (existsSync(join(basePath, "Cargo.toml"))) return "cargo test";
  // Makefile → make test
  if (existsSync(join(basePath, "Makefile"))) return "make test";
  // pyproject.toml → pytest
  if (existsSync(join(basePath, "pyproject.toml"))) return "python -m pytest";

  return null; // No tests detected — skip (zero friction for vibe coders)
}
```

**Merge flow with guard**:
1. `git merge --squash <branch>` (stages changes, does not commit)
2. Run merge guard command
3. On success: `git commit`
4. On failure: `git reset --hard HEAD`, throw error, agent fixes on slice branch

**Preference**: `git.merge_guard: "auto" | "never" | "<custom command>"`
**Default**: `"auto"` (detect from project, skip if nothing found)

#### 8. Infer Commit Type From Slice Metadata

**Source**: Codex

Replace hardcoded `feat(M###/S##)` with type inference:

```typescript
function inferCommitType(sliceTitle: string, sliceMetadata?: SliceMetadata): string {
  // Check explicit metadata first
  if (sliceMetadata?.type) return sliceMetadata.type;

  // Infer from title keywords
  const title = sliceTitle.toLowerCase();
  if (title.match(/\bfix(es|ed|ing)?\b|\bbug\b|\bpatch\b/)) return "fix";
  if (title.match(/\brefactor\b|\bcleanup\b|\brestructure\b/)) return "refactor";
  if (title.match(/\bdoc(s|umentation)?\b|\breadme\b/)) return "docs";
  if (title.match(/\btest(s|ing)?\b|\bspec\b/)) return "test";
  if (title.match(/\bchore\b|\bdep(s|endencies)?\b|\bbump\b|\bci\b/)) return "chore";

  return "feat"; // Default
}
```

#### 9. Richer Squash Commit Messages

**Source**: Claude (implementation)

```
fix(M001/S03): resolve race condition in websocket handler

Tasks:
- T01: identify root cause in connection pool
- T02: implement mutex guard on shared state
- T03: add regression test for concurrent connections

Branch: gsd/M001/S03
```

The commit body includes:
- Task list extracted from branch commit history
- Branch reference (even though branch is deleted, the ref is useful for forensics)
- Commit type inferred from slice metadata

### P2: Remote Workflow and Preferences

#### 10. Git Preferences Schema

**Source**: Claude (schema), Codex (policy-awareness framing)

```typescript
interface GSDGitPreferences {
  /** Pre-merge verification. Default: "auto" (detect from project). */
  merge_guard?: "auto" | "never" | string;

  /** Push main to remote after slice merge. Default: false. */
  auto_push?: boolean;

  /** Push slice branches during work (backup). Default: false. */
  push_branches?: boolean;

  /** Remote name. Default: "origin". */
  remote?: string;

  /** Create git tag on milestone completion. Default: true. */
  tag_milestones?: boolean;

  /** Create PR per slice when remote has protected trunk. Default: false. */
  create_pr?: boolean;
}
```

#### 11. Optional Remote Push

**Source**: Claude (implementation), Codex (framing)

```typescript
// After successful slice merge to main:
if (gitPrefs.auto_push) {
  const remote = gitPrefs.remote ?? "origin";
  runGit(basePath, ["push", remote, mainBranch], { allowFailure: true });
}

// During slice execution (backup):
if (gitPrefs.push_branches) {
  const remote = gitPrefs.remote ?? "origin";
  runGit(basePath, ["push", "-u", remote, sliceBranch], { allowFailure: true });
}
```

**Default**: `false` for both. Vibe coders never see remote operations. Senior engineers opt in with one line in preferences.

#### 12. Remote-Aware Branch Freshness

**Source**: Codex

When a remote exists and `auto_push` is enabled:
- `git fetch --prune` before cutting a new slice branch
- Base from true latest default branch HEAD
- Eliminates "branched from stale main" class of problems

#### 13. Policy-Aware PR Workflow

**Source**: Codex (architecture), Claude (PR creation)

When `create_pr` is enabled:
1. Push slice branch
2. Create PR via `gh pr create` (graceful fallback if `gh` not installed)
3. If merge queue available, enable auto-merge
4. Mark slice complete only after merge to trunk succeeds

For solo developers: skip PR, squash merge locally (default behavior).

#### 14. Milestone Tags

**Source**: Claude

```typescript
function tagMilestone(basePath: string, milestoneId: string, title: string): void {
  runGit(basePath, ["tag", "-a", milestoneId, "-m", `Milestone ${milestoneId}: ${title}`]);

  if (gitPrefs.auto_push) {
    runGit(basePath, ["push", gitPrefs.remote ?? "origin", milestoneId], { allowFailure: true });
  }
}
```

Enables `git describe`, changelog generation, and clear release markers.

---

## Part 6: User Experience By Persona

### Vibe Coder (Zero Config)

What they experience:
- Say what to build → GSD isolates work on a branch automatically
- Main stays clean with readable one-line-per-feature history
- If tests exist, they run before merge (auto-detected)
- If something breaks, GSD rolls back invisibly using snapshot refs
- No git knowledge required. No configuration. No ceremony.

What they never see:
- Branch creation/deletion
- Checkout operations
- Merge mechanics
- Stash juggling
- Remote operations

### Senior Engineer (Opt-In)

Adds to `.gsd/preferences.yaml`:
```yaml
git:
  auto_push: true
  tag_milestones: true
```

What they experience on top of the vibe coder defaults:
- Work pushed to remote after each slice merge (backup + visibility)
- Milestone tags for release marking
- Typed commit messages (`fix`, `refactor`, `docs` — not always `feat`)
- Rich commit bodies with task lists
- Snapshot refs available for manual forensics if needed
- Deterministic git mechanics they can inspect and trust

### Team Lead (Full Config)

```yaml
git:
  auto_push: true
  push_branches: true
  tag_milestones: true
  create_pr: true
  merge_guard: "npm run typecheck && npm run test && npm run lint"
```

What they experience on top of senior engineer:
- Slice branches pushed to remote during work (team visibility)
- PRs created per slice (review gate)
- Custom merge guard command matching CI requirements
- Merge queue participation when available

### Progressive Disclosure

1. **Install GSD2** → git workflow works automatically, zero config
2. **Curious** → `git log` shows clean, typed, task-annotated history
3. **Serious** → enable `auto_push` for remote backup
4. **Team** → enable `create_pr` for review gates

---

## Part 7: Explicitly Rejected Approaches

| Approach | Why Rejected | Source of Rejection |
|----------|-------------|-------------------|
| GitFlow / permanent `develop` | Dead pattern. Enterprise ceremony with no value for trunk-based agentic workflows. | All three audits |
| Rebase workflows | Squash merge is cleaner, simpler, industry standard for feature branches. Interactive rebase requires human intervention. | Claude, Codex |
| GPG commit signing | Adds friction, zero value when the agent is the committer. Opt-in only. | Claude |
| Commit hooks (husky/lint-staged) | The agent runs verification explicitly via merge guards. Hooks add complexity without value in agentic context. | Claude |
| Preserving merged slice branches by default | Squash commit is the permanent record. Branch sprawl from preserved branches provides near-zero debugging value. Opt-in only. | Codex (Claude disagrees) |
| Git Notes for metadata | Fragile, poorly supported by most tools, unreliable push/pull semantics. Use commit trailers and GSD artifacts. | Rejected from Gemini's proposal |
| Shadow worktrees as default execution | Over-engineering for common single-agent case. Auto-create when parallelism detected. | Modified from Gemini's proposal |
| Cross-slice AI-driven rebase | Science fiction. Merge conflicts require deterministic resolution or human intervention, not LLM improvisation. | Rejected from Gemini's proposal |
| "Agentic Version Control" as a concept | Marketing term, not engineering. GSD2 uses standard git with smart automation. | Rejected from Gemini's framing |
| CI/CD integration | Deployment is the user's concern. Merge guards handle "is it broken?" GSD manages work, not infrastructure. | Claude |
| Monorepo tooling | Out of scope. GSD manages work orchestration, not build systems. | Claude |
| Feature flags as GSD feature | Good practice for application architecture, but out of scope for GSD's git layer. | Modified from Codex's proposal |

---

## Part 8: The Slice Lifecycle (Target State)

### Standard Flow (Local)

```
1. Fetch remote state (if configured)
2. Cut gsd/M001/S03 from fresh trunk HEAD
3. Create hidden snapshot ref
4. Execute task work
5. Commit only owned files with typed commit message
6. Repeat steps 3-5 for each task
7. Run slice verification (merge guard)
8. Squash merge to trunk
9. Delete slice branch
10. Push main (if configured)
11. Tag milestone (if completing milestone)
```

### Standard Flow (With Protected Remote)

```
1. Fetch and prune remote state
2. Cut gsd/M001/S03 from fresh trunk HEAD
3. Create hidden snapshot ref
4. Execute task work
5. Commit only owned files with typed commit message
6. Push slice branch (if configured)
7. Repeat steps 3-6 for each task
8. Run local verification
9. Push branch, create/update PR
10. Enable auto-merge or join merge queue
11. Wait for merge to succeed
12. Mark slice complete
13. Delete local and remote slice branch
```

### Failure Recovery

```
1. Detect failure (build error, test failure, merge conflict)
2. Rollback to most recent snapshot ref
3. Preserve failure context in GSD artifacts
4. Return to slice branch for agent to fix
5. If repeated failure: stop, surface exact issue, wait for human input
```

### Parallel Execution

```
1. Detect independent parallel work opportunity
2. Auto-create worktree for parallel stream
3. Execute parallel stream in worktree
4. Merge back deterministically (squash to trunk)
5. Remove worktree
```

---

## Part 9: What Main History Looks Like (Target State)

```
* a1b2c3d (tag: M001) chore(M001/S05): final cleanup and docs
|
|   Tasks:
|   - T01: update API documentation
|   - T02: remove deprecated endpoints
|   Branch: gsd/M001/S05
|
* d4e5f6a fix(M001/S04): resolve race condition in websocket handler
|
|   Tasks:
|   - T01: identify root cause in connection pool
|   - T02: implement mutex guard on shared state
|   - T03: add regression test
|   Branch: gsd/M001/S04
|
* 7g8h9i0 feat(M001/S03): real-time notification system
|
|   Tasks:
|   - T01: websocket server setup
|   - T02: client subscription manager
|   - T03: push notification integration
|   Branch: gsd/M001/S03
|
* j1k2l3m feat(M001/S02): user authentication flow
* n4o5p6q feat(M001/S01): project scaffold and database schema
```

Readable. Typed. Filterable. Bisectable. Revertable. Self-documenting.

---

## Part 10: Implementation Sequence

| Priority | Change | Effort | Impact |
|----------|--------|--------|--------|
| **P0.1** | Git service layer (move mechanics out of prompts) | Medium | Foundational — enables everything else |
| **P0.2** | Scoped file ownership (replace `git add -A`) | Medium | Eliminates accidental commits |
| **P0.3** | Hidden snapshot refs (replace checkpoint commits) | Small | Clean branch history + reliable recovery |
| **P0.5a** | Fix worktree create ordering | Trivial | Bug fix |
| **P0.5b** | Use deterministic worktree merge helper | Small | Bug fix |
| **P0.5c** | Align docs with behavior | Small | Trust |
| **P1.1** | Merge guards with auto-detect | Small | Main never breaks silently |
| **P1.2** | Infer commit type from slice metadata | Small | Accurate history |
| **P1.3** | Richer squash commit messages | Small | Self-documenting history |
| **P2.1** | Git preferences schema | Small | Enables all opt-in features |
| **P2.2** | Optional remote push | Small | Backup + visibility |
| **P2.3** | Remote-aware branch freshness | Small | Eliminates stale-main branching |
| **P2.4** | Policy-aware PR workflow | Medium | Team workflows |
| **P2.5** | Milestone tags | Trivial | Release markers |
