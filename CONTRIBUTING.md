# Contributing

The long-form documentation lives in [`docs/`](docs/). This file is the short
version: what you need to get a change landed.

- [docs/development.md](docs/development.md): setup, working without hardware,
  adding an integration (a plugin)
- `CLAUDE.md`: every convention, each one a hard rule, for people and AI agents
  alike
- `TODO.md`: the backlog

## Requirements

- [mise](https://mise.jdx.dev), which pins Bun, Go and prek. Or
  [Bun](https://bun.sh) alone.
- Docker, to build the image.
- Go and Python 3, only to test the plugin SDKs (`sdk/go`, `sdk/python`) and the
  process-plugin unit tests.

## Setup

```bash
mise run bootstrap   # bun install, then .env with a fresh AUTH_SECRET
bun run dev          # dev server on :5173, worker included
```

Without mise: `bun install`, copy `.env.example` to `.env` and set `AUTH_SECRET`
(`openssl rand -base64 32`).

The dev server migrates `./data/localassistant.sqlite` and starts the worker
under watch. Delete the file to start over from a fresh instance; the setup code
is in the dev server's output.

Installing dependencies wires the git hooks through prek: `pre-commit` runs the
fixers and checks, `commit-msg` enforces Conventional Commits, `pre-push` runs
the type check, the import-cycle check and the unit tests.

## The commands

```bash
bun run dev          # Vite dev server on :5173, with the worker
bun run build        # build/server and build/worker
bun run start        # run the compiled server, which spawns the worker
bun run check        # svelte-check (fails on warnings) and bun check
bunx prek run --all-files  # every hook over every file, bun lint included
bun run format       # bun fmt, Markdown included
bun run circular     # fails on an import cycle
bun run test         # unit tests
(cd sdk/go && go test ./...)         # Go SDK
(cd sdk/python && python3 -m unittest)  # Python SDK
bun run test:integration  # HTTP flows against the built server
bun run test:e2e     # Playwright against the built server
bun run db:generate  # a migration from the schema
mise run verify      # every hook at the commit and push stages, as CI runs them
```

The package manager is **bun**. Never npx or npm.

## The container

`compose.yaml` builds the image from your checkout and runs it on port 3000,
with `AUTH_SECRET` and `ORIGIN` from `.env`:

```bash
docker compose up --build
```

It is for checking the real container before a PR. Self-hosters copy the
`compose.yaml` block in `README.md` and `docs/install.md`, which pulls the
published image, the same as `compose.prod.yaml`; keep all of them in step.

## Screenshots

```bash
mise run screenshots   # every screen into docs/images/
mise run showcase      # the README hero, docs/images/feature.webp
```

Desktop shots are dark theme at 1440 by 900, phone shots light theme at 390
by 844. Rerun them when a change moves a screen, and commit the images with it.

## Before you open a PR

- `bun run check`, `bunx prek run --all-files` and `bun run test` pass on the
  whole repo, with zero warnings.
- A schema change comes with its generated migration. Committed migrations are
  append-only: fix a bad one with a new one.
- A new environment variable is declared in `src/env.ts` with a schema and a
  description, and documented in [docs/configuration.md](docs/configuration.md).
- A user-facing change updates the page of `docs/` that describes it.
- Every screen still works at 375px wide.
- Conventional Commit title. Squash merges turn it into the commit releaser
  reads, and `fix`, `feat` and the rest all ship in the next canary.
