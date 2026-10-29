# Plugins

The guide for authors is [docs/plugins.md](../../docs/plugins.md); this note is
the decisions behind it.

- One contract for everyone. Official plugins in `src/plugins/` use the same
  manifest, hooks and `PluginContext` as community ones, so the SDK can't drift
  from what the app actually needs. They may import npm packages and
  `#lib/devices.ts`, `#lib/plugins.ts`, `#lib/plugin-sdk.ts`, never the server's
  internals (`plugins-use-the-sdk` prek hook).
- UI is declarative. A plugin can't ship Svelte: setup forms come from manifest
  fields (validated by `valuesSchema` in `#lib/server/validation/plugins.ts`)
  and devices show on the built-in cards by `card`. A new card is an app change.
- Two runtimes. `bun` imports one ES module bundle into the server and the
  worker; `process` spawns the plugin and speaks JSON-RPC 2.0 over stdio
  (`#lib/server/plugins/process.ts`), restarting it on the next call when it
  dies. Each process (server and worker) runs its own copy of every plugin.
- Code is stored per commit, `<data>/plugins/<id>/<sha>/`, because Bun caches
  modules by path: a new version must be a new path. Updates follow the latest
  GitHub release, else the default branch.
- No sandbox. A plugin runs with the server's rights; the install preview says
  so. Trust comes from the maintenance badge and the admin's judgement.
- Sources live in `#lib/server/plugins/sources/`: one `Forge` each for GitHub,
  GitLab (v4 API, `PRIVATE-TOKEN`), Gitea and Forgejo (v1 API, `token`) and
  folders on the server, behind `pluginSources`, which reads any pasted link and
  asks an unknown site `/api/v1/version` then `/api/v4/version` to tell Gitea
  from GitLab. A plugin row stores its location as
  `<kind>:<origin>/<repository>` (`folder:<path>`), so a LAN site with a port
  and plain HTTP works. A folder's "commit" is a digest of its manifest and the
  files it names: editing them offers an update.
- Tokens are per site (`sourceTokens` setting, encrypted, checked against the
  site's "who am I" endpoint first). With one, GitHub downloads go through the
  contents API instead of raw.githubusercontent.com, so private repositories
  work.
- Maintenance comes from GitHub's repository data, checked daily
  (`plugins.check` job): archived, else pushed within six months (maintained), a
  year (little activity), or older (not maintained).
- Kinds are namespaced by plugin id (`<id>` or `<id>-*`), and the registry
  refuses an install whose id or kinds clash, so existing device rows keep their
  kind across versions.
- SDKs live in `sdk/`. The TypeScript one is a copy of the app's types, held
  equal by `tests/unit/sdk/typescript.test.ts` (it fails type checking on any
  drift); Go and Python have their own tests in the `sdks` CI job, and
  `tests/unit/lib/server/process-plugins.test.ts` drives the Python SDK through
  the real host.
