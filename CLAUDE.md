# LocalAssistant

## What this is

LocalAssistant is a small, self-hosted alternative to Home Assistant for one
household: Tuya blinds, Bambu printers, ESPHome and Zigbee2MQTT devices, Shelly
meters and RTSP cameras locally; MELCloud, Dreame, Enedis and Frigate when they
must. Automations, energy charts and a wall panel on top. Admins add devices;
everyone signed in drives them. A PWA on phones, a full app on desktop.

SvelteKit 3 with Svelte 5 runes on Bun, compiled by `@sveltejs/adapter-bun` into
`build/server`, which spawns and supervises the compiled worker `build/worker`:
one container, one SQLite file (Drizzle over `bun:sqlite`), ffmpeg in the image.
better-auth with two-factor, passkeys, email sign-in and SSO. AI apps reach
`/mcp` behind better-auth's OAuth provider with CIMD. Tailwind v4 and
shadcn-svelte, `bun lint`, `bun fmt`, prek hooks, mise.

## How to work here

- Ship like a small team: no phased rollouts, priority tiers, migration plans,
  risk matrices or asking whether to ship. Do the whole change in one go,
  proceed on what was already asked, fix instead of ranking findings, no feature
  flags, compat shims or deprecation windows. Breaking dev data or needing a
  manual step is fine: say so and move on. The conventions still apply.
- End every turn that edited files with a suggested one-line conventional commit
  message in a code block. Suggest, never commit.
- `TODO.md` is the only backlog, one `- [ ]` checkbox per entry. Pick from it
  when there's no specific ask, mark an item `**[WIP]**` before starting and
  delete it when done, add a line for anything found out of scope.
  `Small`/`Medium`/`Large` are size, not priority. No personal data in it, ever
  (it's pushed): no real domains, IPs, emails, device IDs, keys or log excerpts.

## Conventions

Each is a hard rule.

- Route files let `./$types` type everything: never `: PageData`,
  `: PageServerLoad`, `: Actions` or `import type ... from "./$types"`. Shared
  modules under `#lib/` are typed explicitly.
- Every signed-in page lives under `src/routes/(protected)/`, whose
  `+layout.server.ts` sends signed-out visitors to `access.redirectToSignIn()`.
  Sign-in, setup and invites live under `src/routes/auth/`.
- Redirects are thrown from `+layout.server.ts`, `+page.server.ts` and form
  actions, never from hooks. `hooks.server.ts` only populates `locals`, runs
  migrations and starts the worker in `init`, logs requests, sets the security
  headers, and hands better-auth its own API paths.
- Loads under `(protected)/` start with `await parent()`
  (`guarded-loads.test.ts`), never re-check `locals.user`. Actions keep their
  own guard; remote functions call `access.requireUser()`.
- Admin is the `role` column on `user` (`admin` or `member`), declared to
  better-auth with `input: false` so no sign-up can set it. The first account,
  made by the setup flow, is the admin; admins promote and demote others from
  the users tab, never themselves. Admin routes live under `(protected)/admin/`,
  whose layout 404s anyone else, and every admin form action re-checks with
  `access.adminFrom(locals)`.
- Accounts only come from the setup flow or an admin invite (name and password
  typed twice against `#lib/password-policy.ts`). There's no open sign-up:
  better-auth's `/sign-up/email` is disabled and SSO never creates accounts.
- A fresh instance (no account) sends every page to `/auth/setup`: a setup code
  from the server log (printed at boot, reprintable), then the first account,
  which becomes the admin. Once an account exists the route sends visitors to
  sign-in and its actions refuse.
- `locals.gate` (`securityPolicy.sessionGate()`) holds factors an admin requires
  and the account lacks: `locals.user` stays null and
  `access.redirectToSignIn()` sends it to the security page; better-auth answers
  HTTP only on `browserPaths`. Handing out access needs
  `securityPolicy.signedInRecently()`.
- Devices belong to the household: every signed-in account reads and drives
  every device. A device sits in a room or, with no room, in the whole house
  (`/rooms/house`); rooms sit on a floor or outside. Device and integration
  setup are admin actions on `/devices`, rooms and floors on `/house`; their
  sheets live in the shell (`#lib/sheets.svelte.ts`) so any page can open them.
- Secrets never reach a page. A Tuya local key lives encrypted in
  `device.local_key`, read only through `DeviceDTO.encryptedLocalKey()`, never
  in `toJSON()`; the MELCloud account and every instance secret live in the
  `setting` table through `getSetting`/`setSetting`, encrypted with
  `secrets.encrypt`, and forms say "leave empty to keep".
- Integrations live in `#lib/server/devices/`: a client per integration reading
  a `DeviceState` (`#lib/devices.ts`) and applying commands, routed by the
  `devices` service. The worker polls the rest every two minutes, one after the
  other; pushed kinds (Zigbee and Shelly through the one MQTT `broker`, phones,
  cameras) save their own state. Printers keep one MQTT connection each, cameras
  one supervised ffmpeg each. Commands are the one request that awaits slow work
  (`#lib/remote/devices.remote.ts`): the person tapping needs to know. Media
  routes outside `(protected)/` (`/cameras`, `/frigate`, `/printers`) check
  `locals.user` themselves and only serve names they validate.
- A tabbed page is one real route per tab under a `TabSection` layout, each tab
  with a description. On phones the index route is `NavCards` and each tab is a
  page with a back button; on desktop the index opens the first tab and `TabNav`
  shows them all.
- Page chrome comes from `setPageTitle(title, backHref, actions)`: the phone app
  bar and the desktop page header render it. A `primary` action is a filled
  button on desktop only, phones reach it through the `Fab`.
- Every select and combobox is a `Picker`: shadcn `Select` or Popover with
  Command on desktop, its own drawer on phones, nested over an open drawer.
  Never a native `<select>`. A set of two to seven options is a `ToggleGroup`.
- No raw Drizzle in routes: DTOs in `#lib/dto/`, one per table, and `load`
  returns `.toJSON()`.
- Form input is validated with a zod schema in `#lib/server/validation/` through
  `parseForm()`; remote functions take the schema as their first argument. Never
  cast `FormData` values.
- Migrations are append-only: never edit or regenerate one that exists, the boot
  check refuses a changed history. drizzle-kit drops `ON DELETE` from an
  `ALTER TABLE ... ADD ... REFERENCES`, so read the generated SQL before a dev
  server applies it.
- The Docker build context is an allowlist (`.dockerignore`): a new top-level
  build input has to be added there.
- Anything slow (emails, push, device polling) is a job: `JobDTO.enqueue()` with
  its payload typed in `JobPayloads`, handled in `#lib/server/jobs/handlers.ts`
  by the worker. A request never awaits it, device commands aside.
- Every async user action goes through `toast.promise`: a client handler splits
  into a throwing `<name>Callback()` that restores its own UI state and a thin
  `handle<Name>()`; a `use:enhance` form uses `enhanceToast` or `saveToast` with
  `reset: false` by default. Exceptions: synchronous results, remote queries
  that render their own inline error, device controls, and the plan editor,
  which keeps drafts and shows a saved line once Done saves them.
- Device controls are optimistic and silent: a `PendingChanges` shows the change
  on the card at once, debounces taps into one command, spins while it's in
  flight and on failure falls back to the last reading with the reason inline in
  red. No toast, ever.
- Every icon-only button is an `IconButton`: an `aria-label` and a tooltip with
  the same text.
- Mobile first: every screen works at 375px wide, respects the safe-area insets
  (`pt-safe-top`, `pb-safe-bottom`), keeps touch targets at 44px or more, and
  uses `ResponsiveSheet` (a drawer on phones, a dialog on desktop) instead of a
  centred dialog. Drawers float with corners concentric to the screen's.
  Navigation is the bottom tab bar on phones and the sidebar on desktop; desktop
  gets real layouts (grids, inline actions, page header buttons), not the phone
  column stretched, and no sliding page transitions.
- Appearance is per account (`appearance` table) and applied as data attributes
  on `<html>` by an inline boot script, so a reload never flashes. Colours come
  from the tokens in `layout.css`, all derived from `--hue`: never a raw
  Tailwind palette colour.
- A page runs full width (`px-4 md:px-6`, no `max-w-*` on the page) except a
  centred single-purpose card; device cards fill a grid that adds columns as the
  screen widens.
- `#lib` with extensions; links through `resolve()` with a route id or a
  pathname without the leading slash; `paths.relative` stays off.
- `handleError` handles `kind === "unknown"` only and never returns the real
  message.
- `authService.publicOrigin()` is `ORIGIN`, else the setting recorded at setup
  (Admin > Access); auth, emails and passkeys use it, never a request's Host.
  Plain HTTP without a proxy needs `ORIGIN`. `csrfHandler` accepts the request's
  origin or the public one, Kit's check is off. Ignored in dev.
- Environment variables are declared once in `src/env.ts` (`defineEnvVars`, a
  zod schema and a description each), typed by Kit's generated declaration and
  read only from `$app/env/private` in `#lib/server/core/env.ts`, which builds
  the `Config` that `instrumentation.server.ts` passes to `configuration.set()`.
  Everything else calls `configuration.get()`; the worker gets the same `Config`
  from the server over IPC. `process.env`, `Bun.env` and `import.meta.env` are a
  prek error.
- CSS-only packages are devDependencies.
- Logging through `Logger`, structured context as a plain object; `console.*` is
  a lint error.
- A periodic job or fire-and-forget promise always catches: Bun exits on an
  unhandled rejection. A `tuyapi` connection always has an `error` listener, or
  its emitter crashes the process.
- No unused code; `bun run check` (fails on warnings) and
  `bunx prek run --all-files` clean, whole repo, after every change.
- No comments in any code file, YAML or shell included. The exception is a
  required JSDoc block above every class method and exported function (what it
  does, side effects, throws, never the types), one or two lines. Tool
  directives with a reason are fine.
- Real OOP: a `#lib/server/` module is a class exported as one singleton
  (`export const devices = new Devices()`), helpers `#private`; schemas, the job
  table and `Handle`s stay plain, DTOs keep static finders.
- No abbreviated names.

## Reference notes

Read only the note for the area you touch. A new area with its own decisions
gets its own note and row.

| Area                                                     | Note                           |
| -------------------------------------------------------- | ------------------------------ |
| Scripts, mise tasks, git hooks, tests, the worker in dev | `.agents/notes/commands.md`    |
| The PR gate, canaries, the release PR, images, secrets   | `.agents/notes/ci-releases.md` |

## AI-assisted development

Skills (`.agents/skills/`, linked from `.claude/skills/`):

- `check-repo`: runs every gate before calling a change done.
- `new-dto-route`: a table, its DTO and a route, with the conventions above.
- `migration-workflow`: changing `schema.ts` and getting it applied on SQLite.
- `new-tab-route`: adding a tab or splitting a page into tab routes.
- `new-remote-function`: a query or command under `#lib/remote/`.
- `shadcn-svelte`: adding and composing shadcn-svelte components.

Agents (`.claude/agents/`):

- `repo-gate`: runs the gates and scans the diff for every convention.
- `scaffold-feature`: builds a feature end to end from the backlog.
- `ui-consistency`: checks screens against the mobile-first rules.
- `docs-sync`: keeps CLAUDE.md, AGENTS.md, the notes and README in line.
- `doc-comments`: adds or fixes the required JSDoc blocks.
- `devex`: records developer-experience friction as `TODO.md` lines.

Skill frontmatter must be valid YAML: `description: >-` with the text indented.
The Stop hook (`.claude/hooks/gate.sh`) blocks the hand-back until it's green.
