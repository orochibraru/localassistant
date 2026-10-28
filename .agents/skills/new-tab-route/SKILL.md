---
name: new-tab-route
description: >-
  Workflow for adding a tab to a tabbed page, or splitting a growing page into
  tabs, following this repo's one-route-per-tab convention: a shared
  +layout.svelte owning TabNav, a +layout.server.ts holding the common guard and
  load, the default tab as a bare +page.svelte and every other tab as its own
  subfolder. Use when adding a section to the admin area, the account settings,
  or any page shaped like them; never a client-side activeTab switch in one
  file.
---

# new-tab-route

A page made of tabs gets one real route per tab, not one file with a client-side
`activeTab` switch. Each tab gets its own URL (back button, deep links,
installed PWA restores), its own `load` and its own actions.

The in-page `TabNav` is not the app's bottom tab bar: the bottom bar switches
between top-level sections, `TabNav` switches between views of one page.

## 1. Adding a tab to an existing tabbed page

- Create `<parent>/<tab-name>/+page.svelte`, plus `+page.server.ts` if it needs
  its own `load` or actions.
- **Don't re-fetch what the layout already loaded.** If the tab only needs data
  the parent `+layout.server.ts` fetches, its `load` (if it needs one at all)
  calls `const { user } = await parent();`.
- **Don't re-check `!locals.user`** in that `load`: the parent layout already
  ran. Actions are different: a form submission skips the layout's `load`, so
  every action keeps its own `locals.user` guard and, under admin, its own
  `access.adminFrom(locals)` check.
- Add the tab to the parent `+layout.svelte`'s `tabs` array with an `href` built
  by `resolve()` from a route id (see `#lib/components/tab-nav.svelte`).

## 2. Splitting a growing page into tabs

Do it once a page's sections start fighting over one `load` and one set of
actions.

- Move the shared guard and load (the role check, what every tab shows) into
  `<parent>/+layout.server.ts`.
- `<parent>/+layout.svelte` renders `TabNav` and `{@render children()}`. Copy an
  existing tabbed layout's shape rather than inventing a tab bar.
- The default tab is the bare `+page.svelte` at the route's root. Every other
  tab gets a subfolder with only what that tab needs.
- Each tab keeps its own zod schema and form actions, and its mutations go
  through `enhanceToast` or `saveToast`, never a bare `toast.success`.

## 3. Mobile

At 375px the tab strip scrolls horizontally (`TabNav` handles it, don't
hand-roll another strip), every tab is at least 44px tall, and the page content
clears the bottom tab bar and the safe-area inset.

## 4. Finish

Run `check-repo`. If the change touches markup that might duplicate a shared
component or drift from an equivalent page, use the `ui-consistency` agent.
