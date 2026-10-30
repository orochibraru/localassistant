# Health and updates

Back up LocalAssistant from the server, not the app: the `/data` volume holds
everything (the SQLite database, installed integrations and camera recordings).
Snapshot or copy it with the rest of the server's backups, and keep
`AUTH_SECRET` with it: the secrets in the database are encrypted with it. To
copy a running database safely, use
`sqlite3 /data/localassistant.sqlite ".backup /path/to/copy.sqlite"`, or stop
the container first.

## Health

**Admin**, **Overview**, **Server** shows the version and how long it has been
up, the database's size and the free space on its disk (in amber under 1 GB),
and whether every integration loaded.

## Updates

The worker asks GitHub once a day for LocalAssistant's latest release. When it's
newer than the one running, admins see it at the top of **Home** and of
**Admin**, **Overview**, with a link to what changed. Update the way you
installed: pull the new image and restart the container.
