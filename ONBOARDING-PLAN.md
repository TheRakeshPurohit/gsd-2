# GSD Onboarding & Install Experience — Implementation Plan

## Problem

1. **Postinstall output is invisible** — npm ≥7 suppresses stdout from lifecycle scripts. The branded GSD banner during `npm install -g gsd-pi` is swallowed unless the user passes `--foreground-scripts`.
2. **The clack onboarding wizard is dead code** — `src/onboarding.ts` was deleted from source, but its compiled `dist/onboarding.js` ships in the package. Nothing imports it. The actual first-launch flow (`wizard.ts`) is a plain-text readline prompt that only asks for tool API keys — no LLM provider selection, no OAuth, no branding.
3. **No `gsd config` command** — users who want to update keys later must manually edit `~/.gsd/agent/auth.json`.

## Desired End State

### 1. `npm install -g gsd-pi@latest`
- Shows the GSD ASCII banner, version, and setup progress (patches, playwright)
- All output goes to **stderr** so npm never suppresses it
- **No interactive prompts** — install is non-interactive
- Already works correctly except for the stderr routing (partially done, needs audit)

### 2. First `gsd` launch (no LLM provider configured)
- Full branded **clack-based** onboarding wizard:
  1. GSD ASCII logo + "Welcome to GSD — let's get you set up"
  2. **Choose LLM provider** — Anthropic OAuth (recommended), Anthropic API key, OpenAI, GitHub Copilot, Codex, Gemini CLI, Antigravity, Other, Skip
  3. **Authenticate** — OAuth browser flow or masked API key input, with retry/skip on failure
  4. **Optional tool API keys** — Brave Search, Brave Answers, Context7, Jina, Tavily, Slack Bot, Discord Bot (confirm gate: "Set up optional tool API keys?")
  5. **Summary note** — what was configured, what was skipped
  6. **Outro** — "Launching GSD..."
  7. TUI launches regardless of what was skipped
- Gate: `shouldRunOnboarding()` — runs when no LLM provider has credentials AND stdin is TTY
- All steps skippable, all errors recoverable, never crashes boot

### 3. Returning user launches `gsd`
- **Straight to TUI** — no prompts, no wizard
- `loadStoredEnvKeys()` hydrates env vars from auth.json as before
- Never re-prompted for keys already stored (even if stored as empty/skipped)

### 4. `gsd config` command
- Replays the full onboarding wizard with current values shown
- Available anytime — re-run to change LLM provider or update tool keys
- Exits after wizard completes (does not launch TUI)

---

## Implementation Steps

### Step 1: Recreate `src/onboarding.ts`

Reverse-engineer from the compiled `dist/onboarding.js` (full source is intact). Create `src/onboarding.ts` with proper TypeScript types.

**Exports:**
- `shouldRunOnboarding(authStorage: AuthStorage): boolean`
- `runOnboarding(authStorage: AuthStorage): Promise<void>`

**Dependencies verified against AuthStorage API (from pi-coding-agent d.ts):**
- `authStorage.list(): string[]` ✓
- `authStorage.has(provider): boolean` ✓
- `authStorage.get(provider): AuthCredential | undefined` ✓
- `authStorage.set(provider, credential): void` ✓
- `authStorage.login(providerId, callbacks): Promise<void>` ✓
- `authStorage.getOAuthProviders(): OAuthProviderInterface[]` ✓

### Step 2: Create `src/logo.ts`

The logo module also doesn't exist in source. Recreate from `dist/logo.js`:
- `GSD_LOGO: string[]` — raw logo lines
- `renderLogo(color: (s: string) => string): string`

### Step 3: Update `src/wizard.ts`

- **Keep** `loadStoredEnvKeys()` — still needed on every launch
- **Remove** `runWizardIfNeeded()` — replaced by onboarding flow
- File becomes just the env hydration utility

### Step 4: Update `src/cli.ts`

Replace:
```ts
import { loadStoredEnvKeys, runWizardIfNeeded } from './wizard.js'
// ...
if (!isPrintMode) {
  await runWizardIfNeeded(authStorage)
}
```

With:
```ts
import { loadStoredEnvKeys } from './wizard.js'
import { shouldRunOnboarding, runOnboarding } from './onboarding.js'
// ...
if (!isPrintMode && shouldRunOnboarding(authStorage)) {
  await runOnboarding(authStorage)
}
```

### Step 5: Add `gsd config` subcommand

In `src/cli.ts`, detect `config` as the first positional argument before the main flow:

```ts
// After parseCliArgs, before isPrintMode check:
if (cliFlags.messages[0] === 'config') {
  await runOnboarding(authStorage)  // Full wizard replay
  process.exit(0)
}
```

Also add to `--help` output.

### Step 6: Audit `scripts/postinstall.js` stderr routing

The postinstall already has `process.stdout.write = process.stderr.write.bind(process.stderr)` which redirects clack's stdout to stderr. Verify this works by:
1. Confirming the banner, spinner, and summary all route through this redirect
2. Testing `npm install -g` without `--foreground-scripts`

If npm still suppresses it, the fallback is to replace clack calls in postinstall with direct `process.stderr.write()` calls (the postinstall doesn't need interactivity — it's spinners and status only).

### Step 7: Update `src/loader.ts` first-launch banner

`loader.ts` currently prints its own ASCII banner on first launch (`!existsSync(appRoot)`). This will now conflict with the onboarding wizard's banner. Options:
- **Remove the loader banner** — let onboarding handle branding on first launch
- **Keep it** — onboarding will print its own intro, so skip the logo in onboarding if loader already printed it

Recommended: Remove the loader banner. The onboarding wizard is the proper branded first-launch experience. Returning users never see either banner (appRoot exists).

### Step 8: Build and verify

1. `npm run build` — confirm TypeScript compiles
2. Delete `~/.gsd/agent/auth.json` to simulate fresh install
3. Run `gsd` — verify full clack onboarding appears
4. Run `gsd` again — verify straight to TUI (no wizard)
5. Run `gsd config` — verify wizard replays
6. `npm install -g .` — verify postinstall banner shows without `--foreground-scripts`

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `src/logo.ts` | **Create** | Shared ASCII logo module |
| `src/onboarding.ts` | **Create** | Full clack-based onboarding wizard |
| `src/wizard.ts` | **Trim** | Remove `runWizardIfNeeded`, keep `loadStoredEnvKeys` |
| `src/cli.ts` | **Edit** | Wire onboarding + `gsd config` subcommand |
| `src/loader.ts` | **Edit** | Remove first-launch banner (onboarding handles it) |
| `scripts/postinstall.js` | **Audit** | Verify stderr routing works without `--foreground-scripts` |

## Risks

- **`@clack/prompts` availability** — It's a transitive dependency (not in gsd-pi's direct deps). The onboarding module already has a try/catch fallback for this. Should work, but if clack is tree-shaken or hoisted away, the fallback fires and the user just gets the TUI with no wizard. Non-fatal.
- **OAuth flow in onboarding** — Depends on pi's `authStorage.login()` + `getOAuthProviders()`. These are stable public API per the d.ts. If a provider's OAuth config changes upstream, the onboarding gracefully falls back to retry/skip.
- **stdin contention** — Clack's prompts take over stdin. Must ensure clack fully releases stdin before the TUI's InteractiveMode starts. The existing onboarding code's `p.outro()` should handle this.
