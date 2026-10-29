# Integrations

Every kind of device LocalAssistant talks to comes from an integration: a small
plugin hosted on GitHub. The official ones (Tuya blinds, Mitsubishi through
MELCloud or ESPHome, Zigbee2MQTT, Shelly, cameras, Frigate, Bambu Lab printers,
Dreame robot vacuums, Linky, MQTT discovery and Home Assistant) ship with
LocalAssistant. Anyone can publish more, and an admin adds them from a link,
without a GitHub account.

## Set one up

**Devices** lists every integration that's turned on. Pick one and its sheet
asks for what it needs:

- an account or a server to connect (MELCloud, Dreame, Frigate), then **Find new
  devices** brings in what it has;
- a form per device (a Tuya blind's address and local key, a camera's RTSP
  address);
- nothing at all for the ones whose devices announce themselves (Shelly, once
  the MQTT broker is connected).

Integrations that use the household's MQTT broker (Zigbee2MQTT, Shelly, Frigate
alerts) ask for it first. It's connected once and shared by all of them.

## Devices made for Home Assistant

Two official integrations open the Home Assistant ecosystem:

- **MQTT discovery** brings in every device that announces itself for Home
  Assistant on the MQTT broker (Tasmota, ESPHome, Zigbee2MQTT, Shelly,
  OpenMQTTGateway and many DIY builds), without Home Assistant. Switches and
  lights, covers, door and window sensors, power and energy sensors and
  thermostats show up on their own and stay live.
- **Home Assistant** uses a running Home Assistant as a backend, for devices
  only it integrates: its address and a long-lived access token (your profile,
  Security, in Home Assistant). The same kinds of entities, plus cameras, follow
  it live, and taps become Home Assistant service calls.

Either way, a device only shows when it fits one of LocalAssistant's cards:
media players, locks, fans with speeds and vacuums with maps don't yet. A device
reached two ways shows twice: with the Zigbee integration on, turn off Home
Assistant discovery in Zigbee2MQTT, and don't bridge from Home Assistant what
LocalAssistant already talks to directly.

## Add one from GitHub

**Admin, Integrations** (or **Get more integrations** at the bottom of
**Devices**):

1. Paste the link its author gave you. Any form works: `someone/repository`, the
   address of its GitHub page, or a link to a folder inside a repository.
2. **Look it up** shows its name, author, version, the devices it adds and how
   maintained it is, before anything is downloaded.
3. **Install**. It's ready at once: set it up from **Devices**.

**Browse** lists the public repositories tagged `localassistant-plugin` on
GitHub, most starred first; **Look** opens the same preview.

An integration runs on your server with full access to your devices and your
network. Only install one from someone you trust.

## Add a private integration

An integration in a private repository, yours or your company's, installs the
same way once LocalAssistant may read it. GitHub only lets it in with a token:

1. On GitHub, open your picture, **Settings**, **Developer settings**,
   **Personal access tokens**, **Fine-grained tokens**, **Generate new token**.
2. Name it (`LocalAssistant`), pick an expiry, and under **Repository access**
   choose **Only select repositories** with the integration's repository. For a
   repository owned by an organization, pick the organization as the resource
   owner; it may have to approve the token.
3. Under **Permissions**, **Repository permissions**, set **Contents** to
   **Read-only**. Nothing else: the token can't change anything.
4. **Generate token** and copy it (it starts with `github_pat_`).
5. In **Admin, Integrations**, paste it under **GitHub access** and **Save the
   token**. LocalAssistant checks it with GitHub and stores it encrypted.
6. Paste the repository's link under **Add an integration** and install it as
   any other.

The token also lets LocalAssistant ask GitHub more often, so a busy instance
never hits the hourly limit. When it expires or is revoked, installed
integrations keep running but stop finding updates, and the page says GitHub
refused the token: make a new one and save it in its place. **Remove the token**
forgets it.

The maintenance badge works the same for a private repository: it reads when the
repository last changed.

## Is it maintained?

LocalAssistant asks GitHub about every installed integration once a day, and
when you press **Check for updates**:

| Badge           | Meaning                                               |
| --------------- | ----------------------------------------------------- |
| Official        | Ships with LocalAssistant and is updated with it.     |
| Maintained      | Its author changed it in the last six months.         |
| Little activity | Nothing changed in six months to a year.              |
| Not maintained  | Nothing changed in over a year.                       |
| Archived        | Its author stopped working on it and locked the repo. |

**Update to** appears when its author published a newer release (or, without
releases, pushed to its main branch). An integration that needs a newer
LocalAssistant says so instead of installing.

## Turn off or remove

**Turn off** stops an integration and leaves its devices in place, unread, with
"Its integration is turned off" on their card. **Turn on** brings it back.

**Remove** (community integrations only) deletes the integration, its connection
and its devices.

## Writing one

See [Writing an integration](plugins.md): TypeScript, Go or Python, with an SDK
and an example for each.
