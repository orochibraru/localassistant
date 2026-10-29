# Writing an integration

An integration is a GitHub repository (or a folder in one) with a
`localassistant-plugin.json` manifest and the code it names. LocalAssistant
builds the setup forms from the manifest, shows each device on one of its
built-in cards, and calls your code to connect, find, read and drive devices.

Write it in TypeScript, Go or Python. Each has an SDK and the same example, a
Tasmota plug, under
[`sdk/`](https://github.com/orochibraru/localassistant/tree/main/sdk):

| Language   | Runtime   | SDK                                            | Example                   |
| ---------- | --------- | ---------------------------------------------- | ------------------------- |
| TypeScript | `bun`     | `sdk/typescript/localassistant-plugin.ts`      | `sdk/typescript/example/` |
| Go         | `process` | `github.com/orochibraru/localassistant/sdk/go` | `sdk/go/example/`         |
| Python     | `process` | `sdk/python/localassistant_plugin.py`          | `sdk/python/example/`     |

The official integrations in
[`src/plugins/`](https://github.com/orochibraru/localassistant/tree/main/src/plugins)
use the same manifest and hooks; read them for real-world examples.

## The manifest

```json
{
  "id": "tasmota",
  "name": "Tasmota plugs",
  "description": "Plugs running Tasmota, turned on and off over your network.",
  "author": "Someone",
  "version": "1.0.0",
  "localassistant": "1.1.0",
  "runtime": "bun",
  "entry": "dist/index.js",
  "icon": "plug",
  "needs": [],
  "device": {
    "title": "Add a Tasmota plug",
    "description": "Give the plug a fixed IP in your router.",
    "submit": "Add the plug",
    "fields": [{ "name": "host", "label": "IP address", "type": "text" }]
  },
  "kinds": [
    {
      "id": "tasmota-plug",
      "label": "Tasmota plug",
      "card": "switch",
      "icon": "plug",
      "polled": true
    }
  ]
}
```

| Key              | What it is                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `id`             | Lowercase letters, digits and dashes. Unique across installed integrations.                                                |
| `version`        | Shown to admins. Releases are what updates follow.                                                                         |
| `localassistant` | The oldest LocalAssistant it runs on, `x.y.z`. Older instances refuse to install it.                                       |
| `runtime`        | `bun` (TypeScript or JavaScript, in the server) or `process` (anything else, its own process). Default `bun`.              |
| `entry`          | The file to start: one `.js` bundle for `bun`; a script or binary for `process`, or one binary per platform.               |
| `interpreter`    | `python3` for a Python script. Leave it out for a binary.                                                                  |
| `files`          | Other files to download next to the entry, like the Python SDK.                                                            |
| `icon`           | One of `blinds bot cctv door-open fan gauge heater lightbulb lock plug printer puzzle smartphone speaker thermometer zap`. |
| `needs`          | `["mqtt"]` when it uses the household's MQTT broker: its sheet asks for the broker first.                                  |
| `connection`     | An account or server to connect once: `description`, `connected` (shown once connected), `fields`, `find` (button).        |
| `device`         | A form per device: `title`, `description`, `fields`, `submit`.                                                             |
| `automatic`      | Text for integrations whose devices show up on their own.                                                                  |
| `kinds`          | The device kinds it provides. Each `id` is the plugin id or starts with it and a dash.                                     |

Per-platform binaries, for Go:

```json
"entry": { "linux-x64": "dist/linux-x64", "linux-arm64": "dist/linux-arm64" }
```

Platforms are `linux-x64`, `linux-arm64`, `darwin-x64` and `darwin-arm64`. The
Docker image is Alpine: build static binaries (`CGO_ENABLED=0`).

### Fields

| Key                          | What it is                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| `name`                       | Letters and digits. Not `id`, `name`, `roomId` or `plugin`.                                |
| `label`                      | What the form shows.                                                                       |
| `type`                       | `text`, `secret` (stored encrypted, "leave empty to keep"), `number`, `boolean`, `choice`. |
| `choices`                    | `[{ "value", "label" }]` for a choice: two to seven show as buttons, more as a list.       |
| `default`                    | Used when the field is left empty.                                                         |
| `optional`                   | It may stay empty.                                                                         |
| `min`, `max`                 | Limits of a number.                                                                        |
| `pattern`                    | A regular expression the value must match, with `message` saying what's wrong.             |
| `keyboard`                   | `decimal`, `url` or `email`, for phones.                                                   |
| `description`, `placeholder` | Help under and inside the field.                                                           |

The device form also asks for a name and a room; you don't declare those.

### Kinds and cards

A kind shows on one of LocalAssistant's cards, and its devices report the
matching state:

| `card`    | State                                                                              | Commands it sends |
| --------- | ---------------------------------------------------------------------------------- | ----------------- |
| `cover`   | `{ type: "cover", position }` (0 closed, 100 open, or null)                        | `cover`           |
| `climate` | `{ type: "climate", power, mode, modes, targetTemperature, roomTemperature, ... }` | `climate`         |
| `switch`  | `{ type: "switch", on, power, energy }`                                            | `switch`          |
| `valve`   | `{ type: "valve", target, temperature, battery, setpoint, min, max, ... }`         | `valve`           |
| `contact` | `{ type: "contact", open, battery }`; opening one triggers routines                |                   |
| `meter`   | `{ type: "meter", power, energy }`, watts and kWh; counted in Energy               |                   |
| `linky`   | `{ type: "linky", day, kilowattHours }`, a daily meter                             |                   |
| `printer` | `{ type: "printer", stage, progress, ..., camera }`                                | `printer`         |
| `vacuum`  | `{ type: "vacuum", stage, battery, ... }`                                          | `vacuum`          |
| `camera`  | `{ type: "camera", streaming, recording, live, snapshot, source, ... }`            |                   |

The SDKs carry every state's full type. `houseMeter: true` makes a meter count
as the whole house in Energy; `polled: true` has the worker call `read` every
two minutes; `size` (`small`, `medium`, `large`) and `order` set the card's
default size and place.

## Hooks

Implement only what you need. Every hook gets the context (below).

| Hook       | Called when                                                                                                                                                                                           | Returns                                   |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `connect`  | An admin saves the connection form. Throw to refuse it with a message.                                                                                                                                | nothing                                   |
| `discover` | Right after `connect`, and on the sheet's find button.                                                                                                                                                | found devices                             |
| `add`      | An admin adds or edits a device from the device form.                                                                                                                                                 | the device (`kind`, `externalId`, `host`) |
| `start`    | The worker starts (and after settings change): open connections, subscribe, start timers.                                                                                                             | nothing                                   |
| `stop`     | The worker stops or restarts the plugin.                                                                                                                                                              | nothing                                   |
| `read`     | Every two minutes for polled kinds, and soon after a device is added.                                                                                                                                 | its state                                 |
| `command`  | Someone taps a control. `{ type: "cover", move }`, `{ type: "climate", change }`, `{ type: "switch", on }`, `{ type: "valve", target }`, `{ type: "printer", change }`, `{ type: "vacuum", change }`. | the new state, or nothing                 |
| `serve`    | A page asks for `/media/<device>/<path>`: camera streams, snapshots, clips.                                                                                                                           | a response                                |
| `clips`    | A camera's page opens.                                                                                                                                                                                | `{ title, empty, clips }`                 |

Throw (or return an error) with a sentence a person can act on: it's shown as it
is, on the card or in the form.

## The context

| Call                                | Does                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `settings()`                        | The connection's values, secrets decrypted, or null.                    |
| `devices()`, `device(id)`           | The plugin's own devices, with `fields` and `secret(name)`.             |
| `found(devices)`                    | Adds or updates discovered devices, keeping names and rooms people set. |
| `saveState(device, state)`          | Records a pushed state.                                                 |
| `saveError(device, message)`        | Records why a device can't be reached.                                  |
| `refreshLater(device, delay)`       | Reads a device again later, after a blind stopped moving.               |
| `notify({ title, body, audience })` | Pushes the admins or everyone.                                          |
| `mqtt.subscribe`, `mqtt.publish`    | The household's MQTT broker, shared with the other integrations.        |
| `energy.readings`, `energy.record`  | A meter's stored counter, for history fetched online.                   |
| `folder(...parts)`                  | A folder of its own under the data folder.                              |
| `logger`                            | The server log.                                                         |

TypeScript also gets `every(ms, task)` (a timer stopped for you) and
`sendFile(path, request, cacheControl)` (a file with Range support). Go and
Python plugins run their own timers.

## TypeScript

Copy `sdk/typescript/localassistant-plugin.ts` into your repository, write the
plugin and bundle it with its dependencies into one ES module:

```bash
bun build src/index.ts --target=bun --format=esm --outfile dist/index.js
```

Commit `dist/index.js` (or build it in CI before tagging a release). It runs
inside the LocalAssistant server and worker, so keep timers in `every` and
always catch in fire-and-forget promises: an unhandled rejection stops the
process.

## Go

```bash
go get github.com/orochibraru/localassistant/sdk/go
```

Implement the hooks as methods (`Add`, `Read`, `Command`, ...) and call
`localassistant.Run(plugin)` from `main`. Build one static binary per platform
and list them in `entry`:

```bash
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o dist/linux-x64 .
```

```bash
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -o dist/linux-arm64 .
```

## Python

Copy `sdk/python/localassistant_plugin.py` next to your script and list it in
`files`; set `"interpreter": "python3"`. Write a class with the hooks
(`add(context, values)`, `read(context, device)`, ...) and call `run(Plugin())`.
Only the standard library is available in the Docker image.

## Publishing

1. Push the repository to GitHub, GitLab, Gitea, Forgejo or Codeberg. Public for
   everyone; a private one installs only where an admin saved a token for its
   site ([how](integrations.md#add-a-private-integration)).
2. Tag it with the topic `localassistant-plugin` so it shows up under **Browse**
   (GitHub, gitlab.com and Codeberg are searched).
3. Publish releases: LocalAssistant installs and updates from the latest
   release, or from the default branch when there's none. A link to a folder
   (`github.com/you/repo/tree/main/plugins/lamps`,
   `gitlab.com/you/repo/-/tree/main/plugins/lamps`) installs from that folder.

While writing one, install it from a folder on the server instead
([how](integrations.md#add-one-from-a-folder)): **Check for updates** picks up
each rebuild.

Admins see how maintained it is from when you last pushed: keep it alive, or
archive it when you stop.

## The process protocol

Go and Python plugins (and anything else with `"runtime": "process"`) speak
JSON-RPC 2.0, one message per line, on standard input and output. Standard error
goes to the server log. The SDKs implement all of it; this is for other
languages.

LocalAssistant starts the process from its folder and calls `initialize`
(`{ protocolVersion: 1, folder }`), expecting `{ hooks: [...] }` back: the hooks
it implements. It then calls the hooks by name with these params: `connect` and
`add` get `{ values }`; `read`, `clips` and `serve` get `{ device }` (`serve`
also `path`, `method`, `headers`, and answers `{ status, headers, body }` with
the body in base64); `command` gets `{ device, command }`. A device has `id`,
`kind`, `name`, `externalId`, `host`, `homeId`, `roomId`, `fields`, `state`,
`stateAt` and `secrets`, its secrets decrypted.

The plugin calls the host the same way, while a hook runs or any time after
`start`: `settings`, `devices`, `device` (`{ id }`), `found` (`{ devices }`),
`saveState` (`{ deviceId, state }`), `saveError` (`{ deviceId, message }`),
`refreshLater` (`{ deviceId, delayMs }`), `notify`, `folder` (`{ parts }`),
`mqtt.configured`, `mqtt.subscribe` (`{ filter }`), `mqtt.publish`
(`{ topic, payload }`), `energy.readings` (`{ deviceId }`) and `energy.record`
(`{ deviceId, hour, total }`). A `log` notification
(`{ level, message, context }`) writes to the server log; subscribed MQTT
messages arrive as `mqtt.message` notifications (`{ topic, payload }`, payload
in base64).

Answer within a minute. A process that exits is started again on the next call,
and `start` is called again if it was running.
