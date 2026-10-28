# Commands

## Scripts

- `bun run dev`: Vite dev server. Its `init` hook migrates the SQLite file and
  spawns the worker as `bun --watch src/worker/index.ts`, so worker changes
  reload on their own. Stopping the server stops the worker: SIGINT, SIGTERM and
  SIGHUP go through a graceful shutdown in `hooks.server.ts`, any other exit
  signals it from an `exit` handler, and a SIGKILL is caught by the worker's
  parent watchdog within a second. The worker polls every device every two
  minutes, so a dev server with real devices configured talks to them.
- `bun run build`: `vite build`, then `bun build --compile` of the worker.
  Output: `build/server` (client assets embedded) and `build/worker`.
- `bun run start`: runs `build/server`, which spawns `build/worker` from the
  same folder.
- `bun run check`: svelte-check over the app and tests (fails on warnings), then
  Bun's own `bun check` (tsc's errors, far faster) over the service worker and
  `scripts/`. It needs `--no-script`, or `bun check` runs this `check` script
  and calls itself. `.svelte` files stay with svelte-check.
- `bunx prek run --all-files`: every check, each a prek hook (`bun lint` alone
  runs only Bun's linter); there are no `lint:*` scripts.
- `bun run format`: `bun fmt` over the repo (code and Markdown).
- `bun run circular`: madge over `src/`, fails when an import cycle exists or a
  `#lib` import couldn't be resolved.
- `bun run test`: unit tests under `tests/unit/`.
- `bun run test:integration`: builds, then `tests/integration` with
  `tests/integration/bunfig.toml` (no reruns, no coverage: the flows are
  stateful) against `build/server` on a fresh database, booted by
  `tests/support/app.ts`, which reads the setup code from the server's log.
- `bun run test:e2e`: builds, then Playwright (`playwright.config.ts`): a
  `setup` project creates the admin and saves the session to `tmp/e2e/`, then
  `desktop` and `phone` projects run on it. CI runs both suites in the
  `app-tests` job.
- `bun run db:generate`: writes a migration to `drizzle/` from `schema.ts`.
  Migrations apply at boot, never by hand.

`bunfig.toml` sets `[run] bun = true`, so every script and binary runs on Bun,
never Node.

## mise

`mise.toml` pins Bun (matching `packageManager`), Go (pinact builds with it),
and prek, and its `postinstall` hook runs `prek install`. Every task is a file
under `.mise/tasks/`, never a `[tasks]` table:

- `bootstrap`: install, then `.env` from `.env.example` with a fresh
  `AUTH_SECRET`.
- `verify`: prek over every file at the commit and push stages, what CI runs.
- `screenshots`: builds the app, seeds a throwaway demo database through the
  DTOs, boots `build/server` on it and has Playwright's Chromium shoot the docs
  screenshots into `docs/images/`. Scratch files go to `tmp/`.
- `showcase`: renders `docs/images/feature.webp`, the README hero, from those
  screenshots.

Plain `bun install` works without mise.

## Git hooks

`bun install` wires them through prek once the repo is a git repository.

- pre-commit: hygiene, gitleaks, typos, actionlint, zizmor, pinact, hadolint,
  `bun lint` (Bun's linter, reading `.oxlintrc.json`), `bun fmt`, markdownlint,
  agnix, tailwint, and the convention hooks (no hand-typed route types, no raw
  Drizzle in routes, no `redirect(` in hooks, no `href="/`, no Markdown link to
  a file that doesn't exist, offline, with extensionless links to docs pages
  allowed). That every `(protected)` load calls `parent()` is a unit test,
  `tests/unit/routes/guarded-loads.test.ts`.
- commit-msg: Conventional Commits.
- pre-push: `check`, `circular`, `test-unit`.
- post-checkout: `bun install`.

## Tests

- `bun test` with `tests/unit/app/svelte-loader.ts` preloaded: it compiles
  `.svelte` and `.svelte.ts` for the client, registers happy-dom per test and
  mocks `$app/paths` (`resolve` adds the leading slash and drops route groups).
- The preload calls `configuration.set()` with a test `Config` (in-memory
  SQLite, a test `AUTH_SECRET`); tests change it through `configuration.get()`.
  `resetDatabase()` in `tests/unit/database.ts` migrates and empties the tables.
  `src/env.ts`'s schemas are tested directly through their `~standard`
  validators.
- The preload mocks `$app/env` and `$app/server`. happy-dom is registered only
  by component tests (`GlobalRegistrator` in `beforeAll`): registered globally
  it replaces `fetch`, `Request` and `Headers`, which strip `Origin` and break
  server tests.
- `rerunEach = 3` surfaces flaky tests. Coverage is checked per file: 80% of
  functions and lines.
- `mock.module` is process-global and permanent: every mock of one module
  returns the same shape. `svelte-sonner` is mocked because its `runed`
  dependency only exports a `svelte` condition Bun's runner doesn't set.
- Integrations are tested without hardware:
  `tests/unit/lib/server/devices.test.ts` mocks `tuyapi` with `mock.module` and
  MELCloud by spying on `fetch`. The integration suite adds a blind at
  `127.0.0.1` and checks the worker recorded a read (an error, since nothing
  answers there).

## Icons

Made once from `static/favicon.svg` with `@vite-pwa/assets-generator`: the `any`
icons keep the rounded square (padding 0.05); the maskable (192, 512) and Apple
(180) icons are full-bleed (padding 0, background `#911f43`) so a phone's
circle, squircle or rounded-square mask never shows a white ring or white
corners. The house stays inside the maskable safe zone (the centre 80%).
