---
name: new-remote-function
description: >-
  Workflow for adding a query or command under src/lib/remote/*.remote.ts
  (SvelteKit remote functions): access.requireUser() auth plus the device
  lookup, zod-validated arguments, the refresh-in-place versus one-shot
  consumption split, and which data belongs here versus in a route's load. Use
  when adding a panel that loads behind a skeleton, a poll, a picker's on-demand
  lookup, or a small mutation a self-loading component fires; not for data a
  page's own correctness depends on.
---

# new-remote-function

## 1. Does it belong in a remote function at all?

Only data whose absence for a few hundred milliseconds is a skeleton, not a
broken page. The signed-in user and the device list a route renders stay in
`load`. If the page can't render meaningfully without it, it's a `load`.

## 2. File and auth

A new or existing `src/lib/remote/<name>.remote.ts`. Every `query` and `command`
starts with `access.requireUser()` (`#lib/server/auth/access.ts`): a remote
function is its own endpoint and never runs the `(protected)` layout's guard.
`access.requireUser()` is also where an unauthenticated call redirects; nothing
in `hooks.server.ts` does.

```ts
export const controlCover = command(coverActionSchema, async ({ deviceId, action }) => {
  const user = access.requireUser();
  ...
});
```

A function that takes a device id looks the device up and 404s when it's gone.
Commands that change a device's setup (not its state) stay admin form actions.

## 3. Validate arguments, don't cast

Pass a zod schema as the first argument:

```ts
export const deviceStates = query(z.string(), async (deviceId) => {...});
export const moveCover = command(
  z.object({ deviceId: z.string(), position: z.number().int() }),
  async ({ deviceId, position }) => {...},
);
```

Never `"unchecked"`.

## 4. Query versus command

`query` for a read, `command` for a mutation. A command that changes data a
query serves calls that query's `.refresh()` at the end, so the command's own
response carries the update instead of the caller running a separate
`refreshAll()`.

A command that kicks off something slow (an export, an email, receipt
processing) enqueues a job for the worker and returns; it never awaits the slow
work itself.

## 5. Pick the right consumption pattern

A `RemoteQuery` is a stable promise. `{#await someQuery}` renders once and does
not re-render when `.refresh()` lands, because the awaited expression never
changes identity.

- **Refreshes in place** (a poll, a command's single-flight update): read
  `query.ready`, `query.current` and `query.error` directly, with the pending
  branch rendering a skeleton.
- **One-shot, user-triggered lookup** (a button, a picker's on-demand fetch):
  assign a fresh promise to `$state` and `{#await}` that, so the block re-runs
  per invocation.

Don't `{#await}` a bare `query()` call that has to reflect a later `.refresh()`.

## 6. Toast exception

A remote-query panel is one of the exceptions to "every async action goes
through `toast.promise`": it renders its own skeleton and reports failure inline
(`query.error`, a `{:catch}` block). A deliberate user submission still goes
through a form and `enhanceToast`. A command called from a click handler goes
through `toast.promise` with `toastError` reading the thrown `HttpError`, except
a device control: it goes through `PendingChanges`
(`#lib/pending-changes.svelte.ts`), optimistic, debounced, with its error inline
and no toast.

## 7. Finish

Run the `check-repo` skill.
