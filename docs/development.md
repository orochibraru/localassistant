# Development

## Setup

```bash
mise run bootstrap   # bun install, then .env with a fresh AUTH_SECRET
bun run dev          # dev server on :5173, worker included
```

The dev server migrates `./data/localassistant.sqlite` and starts the worker
under watch. Delete the file to start over; the setup code is in the dev
server's output.

## Without hardware

The unit tests mock `tuyapi` and MELCloud's HTTP API, so nothing needs a real
device. On a dev server, a blind added at an address nothing answers on shows
its error on Home after the first read.

## Adding an integration

A new kind is a value in `deviceKinds`, a client in `#lib/server/devices/` that
reads a `DeviceState` and applies commands, a branch in the `devices` service, a
card component, and an admin form. Commands go through a remote function, reads
through the worker.
