# Configuration

Environment variables cover what the server needs at boot. Everything else
(devices, invites, sign-in methods, email) is set in the app's admin area.

## Required

| Variable      | What it does                                                    |
| ------------- | --------------------------------------------------------------- |
| `AUTH_SECRET` | Signs sessions and encrypts stored secrets; 32 characters or up |

Generate it with `openssl rand -base64 32`. Changing it signs everyone out and
makes the stored Tuya keys and MELCloud password unreadable: add them again.

## Origin

| Variable | Default                | What it does                                         |
| -------- | ---------------------- | ---------------------------------------------------- |
| `ORIGIN` | from the proxy headers | The public URL; required on plain HTTP with no proxy |

`PORT`, `PROTOCOL_HEADER` and `HOST_HEADER` belong to the Bun adapter; the image
sets the two headers to `x-forwarded-proto` and `x-forwarded-host`.

## Sign-in override

| Variable          | Default | What it does                                                   |
| ----------------- | ------- | -------------------------------------------------------------- |
| `SIGN_IN_METHODS` | unset   | `password,passkey,magic-link,email-code`: forces those methods |

Set it to get back in after turning off the method you use, then remove it.

## Database

| Variable        | Default in the image          | What it does    |
| --------------- | ----------------------------- | --------------- |
| `DATABASE_PATH` | `/data/localassistant.sqlite` | The SQLite file |

Migrations run at every boot, before the worker starts.

## Background worker

| Variable                  | Default | Range        | What it does                            |
| ------------------------- | ------- | ------------ | --------------------------------------- |
| `WORKER_CONCURRENCY`      | `2`     | 1 to 32      | Background jobs run at once             |
| `WORKER_POLL_INTERVAL_MS` | `1000`  | 100 to 60000 | How often the worker looks for due jobs |

## Logging

| Variable     | Default   | Values                                    |
| ------------ | --------- | ----------------------------------------- |
| `LOG_LEVEL`  | `info`    | `trace`, `debug`, `info`, `warn`, `error` |
| `LOG_FORMAT` | `console` | `console`, `json`                         |

`console` writes coloured lines; `json` writes one object per line, for a log
shipper.

## Version

| Variable      | Default                  | What it does        |
| ------------- | ------------------------ | ------------------- |
| `APP_VERSION` | set by the release build | Shown in the footer |
