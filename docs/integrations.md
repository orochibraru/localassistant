# Integrations

Every kind of device LocalAssistant talks to comes from an integration: a small
plugin hosted on GitHub. The official ones (Tuya blinds, Mitsubishi through
MELCloud or ESPHome, Zigbee2MQTT, Shelly, cameras, Frigate, Bambu Lab printers,
Dreame robot vacuums, Linky) ship with LocalAssistant. Anyone can publish more,
and an admin adds them from a link, without a GitHub account.

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
