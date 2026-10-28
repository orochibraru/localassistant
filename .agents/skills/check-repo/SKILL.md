---
name: check-repo
description: >-
  Run this before considering any change to this repo done. Executes the real
  gates this codebase enforces: bun run check (svelte-kit sync, svelte-check
  --fail-on-warnings over src/ and tests/, bun check over scripts/, 0 errors AND
  0 warnings), bunx prek run --all-files (prek over every file: bun lint, bun
  fmt, markdownlint, tailwint, agnix, typos, gitleaks and the convention hooks),
  bun run circular and bun run test. Use whenever finishing an edit, before
  saying a change is "done", or after any change under src/, scripts/ or tests/.
allowed-tools: >-
  Bash(bun run check), Bash(bunx prek run --all-files), Bash(bun run circular),
  Bash(bun run test), Bash(bun fmt *), Bash(bun test *),
  Bash(node_modules/.bin/*), Bash(git diff *), Bash(git status *)
---

# check-repo

"After every change" means after every change, not once at the end of a session,
and it means the whole repo. Don't call a red result "unrelated to what I
touched" without reading the failing file first.

## Steps

1. **`bun run check`**: `svelte-kit sync`, `svelte-check --fail-on-warnings`
   over `src/` and `tests/` (the worker under `src/worker/` included), then
   `bun check` over the service worker and `scripts/`. The hard gate: 0 errors,
   0 warnings. A warning fails it exactly like an error.
2. **`bunx prek run --all-files`**: Every linter is a prek hook, so there are no
   `lint:*` scripts: `bun lint` (`--type-aware --max-warnings 0`, rules from
   `.oxlintrc.json`), `bun fmt`, markdownlint-cli2, tailwint, agnix, typos,
   gitleaks, actionlint, zizmor and the pygrep convention hooks (hand-typed
   route types, raw Drizzle in routes, `href="/`). Formatting is `bun fmt`
   everywhere, Markdown included; `.claude/settings.json` already runs it on
   every edited file, so most drift never reaches this step. A formatting
   failure is fixed with `bun fmt <file>`, never by hand.
3. **`bun run circular`**: madge over `src/`. It fails when a `#lib` import is
   skipped, so a green run means it actually saw every import.
4. **`bun run test`**: the unit tests under `tests/unit/` (seconds). Scope it
   while iterating with `bun test tests/unit/<area>`, then run the whole suite
   once at the end: coverage has an 80% threshold on lines and functions, and
   `rerunEach = 3` surfaces flaky tests.
5. **IDE diagnostics are not ground truth.** If an inline error doesn't match
   what `bun run check` reports, trust `bun run check`.

## Reporting

State which commands ran and their real output; don't say "looks clean" without
having run them this turn. Quote a failure with `file:line`, don't paraphrase it
away. A change isn't done until every step is clean.
