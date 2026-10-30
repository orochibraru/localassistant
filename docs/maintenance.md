# Backups, health and updates

## Backups

The worker copies the whole database every day into a `backups` folder next to
it (in the container, `/data/backups`, on the `/data` volume), and keeps the
last seven. A copy is consistent even while the app keeps writing.

**Admin**, **Backups** lists them: **Back up now** takes one, **Download** saves
one to keep somewhere else, **Delete** removes it. A backup holds every account,
device, routine and setting. Secrets in it stay encrypted with the server's
`AUTH_SECRET`, so keep that secret too: a backup restored under another one
loses its integration passwords and keys.

To restore:

1. Stop LocalAssistant (`docker compose stop`).
2. Put the backup in place of the database file (`DATABASE_PATH`, in the
   container `/data/localassistant.sqlite`), and delete the `-wal` and `-shm`
   files next to it.
3. Start it again. It applies any migration the backup is missing.

## Health

**Admin**, **Overview**, **Server** shows the version and how long it has been
up, the database's size and the free space on its disk (in amber under 1 GB),
when the last backup was taken, and whether every integration loaded.

## Updates

The worker asks GitHub once a day for LocalAssistant's latest release. When it's
newer than the one running, admins see it at the top of **Home** and of
**Admin**, **Overview**, with a link to what changed. Update the way you
installed: pull the new image and restart the container.
