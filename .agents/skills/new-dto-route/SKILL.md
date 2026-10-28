---
name: new-dto-route
description: >-
  Step-by-step workflow for adding a new table, DTO and route to this
  SvelteKit/Drizzle app while enforcing its conventions: no raw Drizzle in route
  files, nothing hand-typed in route files ($props(), load and actions all
  inferred from ./$types), toJSON() before a DTO leaves load, nested (protected)
  loads using await parent() instead of re-checking locals.user, device changes
  reserved to admins. Use when adding a database table, a DTO class under
  src/lib/dto/, or a route that reads or writes one.
---

# new-dto-route

Follow this order; each step depends on the previous one being right.

## 1. Schema (`src/lib/server/db/schema.ts`)

Add the table, then follow the `migration-workflow` skill to generate the
migration before writing the DTO, so the columns you reference exist.

## 2. DTO class (`src/lib/dto/`)

Every table is wrapped by a DTO class extending `BaseDTO<TRow>` (see
`base-dto.ts`): static finders return per-row instances, instance methods mutate
that row.

- Static finders: `get(id)`, `list()`, and the listing shapes the route actually
  needs (a `listWithX` join helper when a page needs the join, a plain `list`
  otherwise).
- **Devices are the household's, their setup is the admin's.** Every signed-in
  account reads and drives every device; adding, renaming or removing one, and
  the integrations' credentials, are admin actions re-checked with
  `access.adminFrom(locals)`. Personal data (sessions, preferences) is scoped by
  `userId`. Secrets (a Tuya local key) never leave the DTO through `toJSON()`.
- Instance methods: `update(fields)`, `delete()` and whatever mutations the
  entity needs. No static method taking an id that duplicates an instance
  method: once you have the row via `get`, operate on the instance.
- `toJSON()` (or `BaseDTO`'s, when it's enough) returns a plain object: that's
  what makes the DTO safe to return from `load` (step 4).
- Anything slow the entity triggers (an email, a device poll, a delayed re-read
  after a command) is enqueued as a job for the worker (`src/worker/`), never
  awaited inside the DTO call a request makes.

## 3. Route files: never type anything by hand

Applies to `+page.svelte`, `+layout.svelte`, `+page.server.ts`,
`+layout.server.ts` and `+server.ts`, for `$props()` and for
`load`/`actions`/`GET`/`POST` alike. SvelteKit infers all of it from `./$types`.

- `.svelte`: `const { data } = $props();`, never `: PageProps` or
  `: { data: PageData }`. No `PageData`, `LayoutData`, `ActionData`, `PageProps`
  or `LayoutProps` anywhere in the file.
- `.server.ts` / `+server.ts`:
  `export const load = async ({ locals, parent }) => {...}`, never
  `: PageServerLoad`; `export const actions = {...}`, never `: Actions`;
  `export const GET = async ({ params }) => {...}`, never `: RequestHandler`. No
  `import type {...} from "./$types"`.
- **No raw Drizzle in route files.** `db.select()`, `.insert()`, `.update()` and
  `.delete()` never appear in a route; every read and write goes through the DTO
  from step 2.

## 4. Auth and `load` under `(protected)/`

- Every signed-in page lives under `src/routes/(protected)/`. Its top-level
  `+layout.server.ts` is the one place that redirects a signed-out visitor to
  `auth/sign-in`. Redirects are thrown from `+layout.server.ts`,
  `+page.server.ts` or a remote function, never from `hooks.server.ts`.
- A **nested** load doesn't re-check `!locals.user`: the parent layout already
  ran. Use `const { user } = await parent();`.
- **Actions keep their own guard.** A form submission doesn't run the parent
  layout's `load`, so every action checks `locals.user` itself (and the admin
  role when it changes setup). Prefer one shared sign-in redirect helper over an
  inline `redirect(302, resolve("auth/sign-in"))` per action: every typed
  `resolve()` call costs the type checker time.
- Map DTO instances through `.toJSON()` before returning them from `load`:
  devalue can't serialise a class instance, and DTOs are server-only.

## 5. Validation

A route taking a form submission validates it with a zod schema under
`src/lib/server/validation/`. Never cast `FormData` values.

## 6. UI

The page works at 375px first: safe-area insets, 44px touch targets, a drawer
instead of a centred dialog on mobile. A form submits through `use:enhance` with
`enhanceToast` or `saveToast` from `#lib/toast.ts`.

## 7. Finish

Run the `check-repo` skill: DTO and route additions are exactly what
svelte-check and the convention hooks catch.
