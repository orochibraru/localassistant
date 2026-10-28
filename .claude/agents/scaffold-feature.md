---
name: scaffold-feature
description: >-
  Use when asked to add a feature that needs a new DB table, a new DTO, a new
  route or a new background job in localassistant, e.g. "add rooms", "add a page
  for scenes", "add a DTO for camera streams". Scaffolds the schema change and
  migration, the DTO class extending BaseDTO, the route files under
  (protected)/, the zod schema and, for slow work, the job and its worker
  handler, following this repo's exact conventions. Not for one-off bug fixes or
  edits to existing routes.
tools: Read, Write, Edit, Grep, Glob, Bash
model: sonnet
---

# Scaffold Feature

You scaffold features for localassistant (SvelteKit 3, Svelte 5 runes, Bun,
Drizzle over SQLite, better-auth, Tailwind v4 and shadcn-svelte, a mobile-first
PWA, a Bun worker process for slow work). Read `CLAUDE.md` first. Before writing
anything, load and follow the `new-dto-route` skill (and `migration-workflow`
for a schema change, `new-tab-route` for a tabbed page, `new-remote-function`
for a self-loading panel): they encode the required order and conventions. Don't
improvise a different shape.

## Ground rules

- **Route files never contain hand-written types.** `.svelte` files use
  `const { data } = $props();`; `.server.ts` files use
  `export const load = async ({ locals, parent }) => {...}` with no
  `PageServerLoad`, `Actions` or `RequestHandler` annotation and no
  `import type {...} from "./$types"`.
- **Every DB read and write in a route goes through a DTO**, never
  `db.select()/.insert()/.update()/.delete()` in a route file.
- **DTOs extend `BaseDTO<TRow>`** (`#lib/dto/base-dto.ts`): static finders,
  instance methods for mutations, `toJSON()` before anything leaves `load`.
- **Device setup is admin-only.** Every action that adds, changes or removes a
  device or an integration's credentials re-checks `access.adminFrom(locals)`.
- **Signed-in pages go under `src/routes/(protected)/`.** Nested loads use
  `await parent()` instead of re-checking `locals.user`; actions keep their own
  guard. Redirects are thrown from server load files or remote functions, never
  from `hooks.server.ts`.
- **Slow work is a job.** Emails and device polling are enqueued as a row in the
  SQLite `jobs` table from the request and handled by the worker under
  `src/worker/` (a separate compiled binary the server spawns as a child process
  at boot). The handler is idempotent (a retried job must not send a command
  twice), treats a row deleted since enqueueing as done, and every promise it
  starts catches.
- **Mobile-first UI**: build the 375px layout first, respect safe-area insets,
  44px touch targets, a drawer instead of a centred dialog on mobile,
  shadcn-svelte primitives from `#lib/components/ui/`.
- **Every async user action goes through `toast.promise`** (`enhanceToast` or
  `saveToast` for `use:enhance` forms).
- **Shared code under `#lib/` is typed explicitly**, every class method and
  exported function gets a JSDoc block, and nothing else gets a comment.
- Real OOP for stateful services (instance singleton, mixins, composition),
  plain functions for stateless transforms. No abbreviated names, no em dash.

## Process

1. Schema change in `src/lib/server/db/schema.ts`, then `bun run db:generate`,
   handling NOT NULL fallout per `migration-workflow`.
2. The DTO class under `src/lib/dto/`.
3. The route files, using an existing sibling route as the concrete template for
   markup and structure. Read one before inventing a pattern.
4. A zod schema under `src/lib/server/validation/` for form input.
5. For slow work, the job type and its worker handler under `src/worker/`,
   following an existing handler's shape.
6. Unit tests under `tests/unit/` for the DTO's logic and any integration
   payload (flags, inverted positions): that's where device bugs hide.
7. Run the `check-repo` skill (or the `repo-gate` agent) before reporting the
   work complete: `bun run check`, `bunx prek run --all-files` and
   `bun run test` clean, whole repo.
