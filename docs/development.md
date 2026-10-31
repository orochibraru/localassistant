# Development

## Setup

```bash
mise run bootstrap   # bun install, .env, the Android SDK and emulator, the doctors
mise run dev         # dev server on :5173, worker included
```

The dev server migrates `./data/localassistant.sqlite` and starts the worker
under watch. Delete the file to start over; the setup code is in the dev
server's output.

## Without hardware

The unit tests mock `tuyapi` and MELCloud's HTTP API, so nothing needs a real
device. On a dev server, a blind added at an address nothing answers on shows
its error on Home after the first read.

## Adding an integration

An integration is a plugin: a folder under `src/plugins/<id>/` with a
`localassistant-plugin.json` manifest (its kinds, its connection or add-a-device
form) and an `index.ts` that reads a `DeviceState` and applies commands. The
registry loads it, and the Devices page builds its setup sheet from the
manifest. Commands go through a remote function, reads through the worker.
Plugins outside the repo can also be written in Go or Python, with the SDKs
under `sdk/`; see [Writing a plugin](plugins).
