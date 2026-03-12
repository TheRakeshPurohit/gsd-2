# GSD2 Git Synthesis

Date: 2026-03-12
Repo: `/Users/lexchristopherson/Developer/gsd-2`
Inputs reviewed:
- `CODEX-GIT-AUDIT.md`
- `CLAUDE-GIT-AUDIT.md`
- `GEMINI-GIT-AUDIT.md`

## Bottom Line

`CODEX-GIT-AUDIT.md` is the strongest of the three and should be the baseline for product direction.

`CLAUDE-GIT-AUDIT.md` is strong on current-state analysis, but it recommends a few defaults that cut against both modern hosted Git practice and GSD2's "no theater" constraint.

`GEMINI-GIT-AUDIT.md` has some useful product instincts, but it is too speculative and too detached from the current codebase to use as the primary design document.

The right synthesis for GSD2 is:

1. Keep **trunk-based development with short-lived slice branches** as the default model.
2. Keep **worktrees** as an internal mechanism or an advanced tool, not the default user mental model.
3. Move **mechanical Git actions out of prompts and into deterministic code**.
4. Add **programmatic pre-merge verification** before anything lands on trunk.
5. Delete merged slice branches by default.
6. If a repo has a hosted remote and the user/repo policy allows it, support **push -> PR -> auto-merge / merge queue**.
7. Do **not** make stacked branches, Git Notes, AI-driven rebases, or milestone-sized PRs the default path.

## Verified Current State

These points are confirmed in the implementation, not inferred from the audits:

- Slice branches are real and automatically created before slice-level work runs.
  - `src/resources/extensions/gsd/auto.ts:2222-2224`
  - `src/resources/extensions/gsd/worktree.ts:152-195`
- Slice merges are local squash merges to the current integration branch, followed by branch deletion.
  - `src/resources/extensions/gsd/worktree.ts:237-267`
- Worktrees are implemented with `git worktree add`, and slices inside worktrees merge into `worktree/<name>`, not the repo default branch.
  - `src/resources/extensions/gsd/worktree-manager.ts:94-136`
  - `src/resources/extensions/gsd/worktree.ts:100-128`
- Dirty state is frequently swept up with `git add -A` plus auto-commit.
  - `src/resources/extensions/gsd/worktree.ts:183-191`
  - `src/resources/extensions/gsd/worktree.ts:202-215`
  - `src/resources/extensions/gsd/worktree-command.ts:356-357`
  - `src/resources/extensions/gsd/worktree-command.ts:431-432`
  - `src/resources/extensions/gsd/worktree-command.ts:468-469`
- Prompts still instruct the model to run raw Git commands directly.
  - `src/resources/extensions/gsd/prompts/execute-task.md:57`
  - `src/resources/extensions/gsd/prompts/complete-slice.md:21`
  - `src/resources/extensions/gsd/prompts/replan-slice.md:34`
- Remote push / PR / merge-queue orchestration does not currently exist.
- Docs currently over-promise branch preservation and checkpoint commits relative to implementation.
  - `README.md:258-264`
  - `src/resources/GSD-WORKFLOW.md:548-585`
  - `src/resources/extensions/gsd/worktree.ts:261`

## Review Of The Three Audits

### 1. CODEX audit: best overall

Why it is the best:

- It is the most accurate about the current implementation.
- It identifies the real trust-boundary problem: Git mechanics are still prompt-driven in places, even though they should be deterministic code.
- It aligns well with your stated constraint: best practice without enterprise theater.
- It correctly treats worktrees as useful infrastructure, not as the center of the product.
- It gives the best "two personas" framing:
  - vibe coders get safety without Git choreography
  - senior engineers get trunk discipline, observability, and optional power tools

What to keep from it:

- Trunk-based default
- Branch-per-slice default
- Programmatic merge verification
- Deterministic Git service in code
- Host-aware PR / merge-queue support only when a remote and policy exist
- Stacks only as an advanced mode

What to adjust:

- Hidden snapshot refs are a good direction, but they should follow, not precede, the more important fix of moving staging/committing/merging out of prompt text.
- Host-aware automation must respect the current safety contract: no outward-facing GitHub actions without explicit user confirmation or stored repo policy.

### 2. CLAUDE audit: solid repo audit, weaker product judgment

What it gets right:

- The current-state description is largely accurate.
- The highest-value near-term recommendation is correct: add code-level pre-merge verification before landing a slice.
- It correctly calls out the lack of remote operations and the over-broad `git add -A` auto-commit behavior.

Where it misses:

- It recommends preserving slice branches by default.
  - That conflicts with the repo's current implementation and with the usual short-lived-branch discipline of trunk-based development.
  - It also conflicts with GitHub's built-in support for automatically deleting merged head branches.
- It explicitly downplays hosted branch protection and merge policy.
  - That is the wrong default for shared repos. Protected branches, required checks, linear history, auto-merge, and merge queues are exactly how modern hosted repos encode Git discipline without human nagging.
- It suggests PR creation on **milestone completion** rather than on **slice completion**.
  - That is the wrong unit of integration for GSD2's branch-per-slice model.
  - It would create larger, slower, more review-hostile PRs than the rest of the audit advocates.

Net: use CLAUDE's current-state findings, but do not adopt its default policy decisions wholesale.

### 3. GEMINI audit: interesting vision, not a reliable design basis

What is useful:

- It correctly pushes toward "Git should feel invisible to the user."
- It is directionally right that GSD2 should protect the user's main workspace more aggressively.

Why it should not be the main design document:

- Its current-state audit is materially inaccurate in places.
  - It treats manual checkpoint commits as an implemented strength, but those are documented, not enforced in code.
- It proposes major new abstractions that are not grounded in the current codebase:
  - "Autonomous Shadow Stack"
  - `gsd stack`
  - `gsd undo`
  - `gsd ship`
  - `land-slice`
  - `gsd-executor`
- It relies heavily on Git Notes.
  - Git Notes are not a simple default metadata layer. They require display/rewrite configuration and are much less visible than ordinary commit history.
- It normalizes AI-driven rebases and conflict resolution.
  - That is exactly the kind of hidden magic that makes senior engineers distrust an automation system.

Net: keep the product instinct of "invisible Git UX," but reject the proposed mechanism set as the default plan.

## Recommended GSD2 Git Strategy

### Default mode: local trunk

Use this when there is no configured remote workflow, or when the user wants zero ceremony.

Behavior:

1. Start each slice on a short-lived slice branch from the true integration branch.
2. Keep the user on the slice abstraction, not on raw branch management.
3. Run deterministic Git operations from extension code, not from prompts.
4. Verify before merge.
5. Squash-merge to trunk.
6. Delete the merged slice branch.

This matches trunk-based development better than preserving branches forever, and it keeps GSD2 simple.

### Hosted mode: policy-aware trunk

Use this only when:

- a remote exists
- the repo host is supported
- the user has explicitly opted in, or repo policy has already been stored

Behavior:

1. Create the same short-lived slice branch.
2. Run local verification.
3. Push branch.
4. Create or update PR.
5. If the repo uses required checks / auto-merge / merge queue, integrate with that policy instead of bypassing it locally.
6. Treat "merged to default branch" as the actual completion boundary.

This is the right bridge between solo-maker mode and serious shared-repo mode.

### Advanced mode: optional worktrees and optional stacks

Use only when there is a real payoff:

- parallel agents
- risky spikes
- long-running refactors
- waiting on CI while continuing other work

Worktrees belong here.
Stacked branches belong here.
Neither should be the default explanation of how GSD2 works.

## What GSD2 Should Not Do By Default

- Do not preserve every merged slice branch forever.
- Do not create milestone-sized PRs.
- Do not use Git Notes as the primary audit trail.
- Do not rely on the model to decide what gets staged or merged.
- Do not hide rebases, conflict resolution, or cross-slice history surgery behind "magic."
- Do not make worktree management the first thing a casual user has to understand.

## Concrete Implementation Priorities

### P0

1. Move staging, committing, branch creation, and merging out of prompt text and into code.
2. Add merge-time verification before slice squash commits land.
3. Replace blind `git add -A` auto-commit behavior with owned-file or scoped-file staging.
4. Fix doc/code mismatches around branch preservation and checkpoint commits.

### P1

1. Detect remote/default-branch freshness before branching.
2. Add opt-in hosted workflow support:
   - push
   - PR create/update
   - auto-merge
   - merge queue where available
3. Add Git observability in the UI:
   - current branch
   - current worktree
   - dirty status
   - ahead/behind
   - verification state

### P2

1. Add hidden recovery snapshots if needed after P0 is complete.
2. Auto-create worktrees for parallel execution where the product can justify it.
3. Add stacked execution only as an explicitly advanced mode.

## Final Recommendation

If only one audit becomes the design seed, use `CODEX-GIT-AUDIT.md`.

If you want the actual synthesis:

- take CODEX's strategic direction
- take CLAUDE's strongest implementation findings
- discard GEMINI's speculative mechanism set

That yields the cleanest 2026 answer for GSD2:

**short-lived slice branches, deterministic Git in code, verified merges to trunk, optional hosted PR automation, and advanced worktree/stack behavior only when it genuinely helps.**

## External References

- GitHub: protected branches and required checks
  - https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches
- GitHub: merge queue
  - https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/using-a-merge-queue
- GitHub: auto-merge
  - https://docs.github.com/pull-requests/collaborating-with-pull-requests/incorporating-changes-from-a-pull-request/automatically-merging-a-pull-request
- GitHub: automatic deletion of branches
  - https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-the-automatic-deletion-of-branches
- Git: worktree
  - https://git-scm.com/docs/git-worktree
- Git: notes
  - https://git-scm.com/docs/git-notes
- Trunk-based development: short-lived feature branches
  - https://trunkbaseddevelopment.com/short-lived-feature-branches/
- Trunk-based development: feature flags
  - https://trunkbaseddevelopment.com/feature-flags/
