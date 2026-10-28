---
name: migration-workflow
description: >-
  Workflow for changing src/lib/server/db/schema.ts and getting the change
  applied to the SQLite database: drizzle-kit generate with the sqlite dialect,
  SQLite's ALTER TABLE limits and the table rebuilds drizzle-kit writes for
  them, NOT NULL columns on existing rows, foreign keys that only hold with
  PRAGMA foreign_keys=ON, and how migrations apply at boot before the worker
  starts. Use whenever a table in schema.ts is added or changed, or a column's
  meaning changes.
---

# migration-workflow

## 1. Edit `src/lib/server/db/schema.ts`

Add or change the table or column with `drizzle-orm/sqlite-core`. The app talks
to SQLite through `drizzle-orm/bun-sqlite` (Bun's built-in `bun:sqlite`, no
native dependency), one file at `DATABASE_PATH` (default
`./data/localassistant.sqlite`) in WAL mode. The job queue is the `jobs` table
in the same file. The better-auth tables come from `bunx auth generate`;
regenerate them rather than editing them by hand when better-auth's schema
changes.

## 2. Generate the migration

```bash
bun run db:generate
```

`drizzle-kit generate` with `dialect: "sqlite"` writes a new incremental
migration under `drizzle/`, committed with the change. Never edit an
already-committed migration; add a new one.

## 3. Read the generated SQL: SQLite's ALTER TABLE is limited

SQLite's `ALTER TABLE` can add a column, rename a column or table, and drop a
simple column. It can't change a column's type, nullability or default, or add
or drop a foreign key or a constraint. For those, drizzle-kit writes a table
rebuild: `PRAGMA foreign_keys=OFF`, create `__new_<table>`, copy the rows with
`INSERT INTO ... SELECT`, drop the old table, rename the new one,
`PRAGMA foreign_keys=ON`. Check every rebuild before applying it:

- The `INSERT ... SELECT` copies every column you meant to keep, and a new
  `NOT NULL` column gets a real value in the `SELECT` (a literal or an
  expression), not nothing.
- Indexes and unique constraints on the old table are recreated.
- `ADD COLUMN ... NOT NULL` without a non-null `DEFAULT` fails on a table that
  has rows. Give it a default, or add it nullable, backfill, then rebuild it as
  `NOT NULL` in a second migration.
- Changing the meaning of an existing column needs a backfill of the rows that
  already hold a value, not a silent reinterpretation.

## 4. Apply it

- **Normal boot**: `init` in `hooks.server.ts` opens the database (WAL,
  `PRAGMA foreign_keys=ON`, a `busy_timeout` so the server and the worker don't
  fail on each other's writes) and runs `migrate()` from
  `drizzle-orm/bun-sqlite/migrator` over `drizzle/`, then spawns the worker
  (`build/worker`, source `src/worker/`) as a child process. The worker never
  migrates: it starts after the schema is current. Migrations apply at boot,
  never by hand.
- **Mid-session in dev**: restart `bun run dev`, or run a one-off script calling
  the same `migrate()` against the dev `DATABASE_PATH`. Stop anything holding a
  write transaction on the file first.

## 5. Foreign keys only hold with the pragma

SQLite ignores `references()` unless `PRAGMA foreign_keys=ON` is set on the
connection, and it's per connection: the server's connection and the worker's
own connection both set it when they open the file. With it on,
`onDelete: "cascade"` and `"set null"` are real, so deleting a user removes
their sessions, passkeys and appearance without app code. A test or script that
opens its own connection without the pragma silently skips every cascade.

Cascades only cover rows: anything outside the database a row points at (an
uploaded receipt file) still needs explicit cleanup, and a job whose row was
deleted since it was enqueued is done, not a crash.

## 6. Finish

Add or update the DTO for the table (see the `new-dto-route` skill), then run
the `check-repo` skill.
