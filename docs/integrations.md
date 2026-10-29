# Integrations

Every kind of device LocalAssistant talks to comes from an integration: a small
plugin hosted on GitHub, GitLab, Gitea or Forgejo, or kept in a folder. The
official ones (Tuya blinds, Mitsubishi through MELCloud or ESPHome, Zigbee2MQTT,
Shelly, cameras, Frigate, Bambu Lab printers, Dreame robot vacuums, Linky, MQTT
discovery and Home Assistant) ship with LocalAssistant. Anyone can publish more,
and an admin adds them from a link, without an account anywhere.

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
  OpenMQTTGateway and many DIY builds), without Home Assistant. Switches,
  lights, locks, fans, buttons, covers, door and window sensors, power, energy
  and other sensors, and thermostats show up on their own and stay live.
- **Home Assistant** uses a running Home Assistant as a backend, for devices
  only it integrates: its address and a long-lived access token (your profile,
  Security, in Home Assistant). The same kinds of entities, plus speakers and
  TVs, scenes, scripts and cameras, follow it live, and taps become Home
  Assistant service calls.

Either way, a device only shows when it fits one of LocalAssistant's cards:
vacuums with maps and alarm panels don't yet, and only sensors that measure
something (temperature, humidity, motion and the like) come in, not every
diagnostic value. A light added as a switch before lights had their own card
stays a switch: remove it and find devices again to get the light card. A device
reached two ways shows twice: with the Zigbee integration on, turn off Home
Assistant discovery in Zigbee2MQTT, and don't bridge from Home Assistant what
LocalAssistant already talks to directly.

## Add one

**Admin, Integrations** (or **Get more integrations** at the bottom of
**Devices**):

1. Paste the link its author gave you. Any form works:
   - a repository page on GitHub, GitLab (gitlab.com or your own), Gitea,
     Forgejo or Codeberg, or a link to a folder or branch inside it;
   - a clone address, `git@gitlab.com:someone/repository.git`;
   - `someone/repository`, short for GitHub;
   - a folder on this server, `/plugins/my-integration`.
2. **Look it up** shows its name, author, version, the devices it adds and how
   maintained it is, before anything is downloaded.
3. **Install**. It's ready at once: set it up from **Devices**.

A self-hosted site (`git.example.com`, or `http://192.168.1.5:3000` on your
network) is recognised on its own: LocalAssistant asks it whether it runs
GitLab, Gitea or Forgejo.

**Browse** lists the public repositories tagged `localassistant-plugin` on
GitHub, gitlab.com and Codeberg, most starred first; **Look** opens the same
preview.

An integration runs on your server with full access to your devices and your
network. Only install one from someone you trust.

## Add a private integration

An integration in a private repository, yours or your company's, installs the
same way once LocalAssistant may read it: save a read-only access token for its
site under **Private integrations**, then paste its link.

Make the token on the site:

- **GitHub**: your picture, **Settings**, **Developer settings**, **Personal
  access tokens**, **Fine-grained tokens**, **Generate new token**. Under
  **Repository access** choose **Only select repositories** with the
  integration's repository (an organization's repository may need its approval),
  and under **Repository permissions** set **Contents** to **Read-only**.
- **GitLab**: your avatar, **Edit profile**, **Access tokens**, **Add new
  token**, with the **read_api** scope. A project access token with the same
  scope, made in the project's **Settings**, **Access tokens**, works too and
  reads only that project.
- **Gitea, Forgejo or Codeberg**: your avatar, **Settings**, **Applications**,
  **Generate new token**, with **repository** set to **Read**.

Give it a name (`LocalAssistant`) and an expiry, copy it, and in **Admin,
Integrations**, **Private integrations**, type the site (`github.com`,
`gitlab.com`, `codeberg.org` or your own address) and paste the token.
LocalAssistant checks it with the site and stores it encrypted. Each site keeps
one token; saving another replaces it, and **Remove** forgets it.

A token also lets LocalAssistant ask the site more often, so a busy instance
never hits an hourly limit. When it expires or is revoked, installed
integrations keep running but stop finding updates, and the page says the site
refused the token: make a new one and save it in its place.

## Add one from a folder

No git at all: an integration in a folder on the server installs from its path.
It's also how to try one while writing it.

With Docker, mount the folder into the container, read-only, then paste the path
it has inside:

```yaml
services:
  localassistant:
    volumes:
      - ./data:/data
      - ./my-integration:/plugins/my-integration:ro
```

The folder holds the `localassistant-plugin.json` and the files it names, built.
Its badge says **Local folder**. LocalAssistant keeps its own copy, so editing
the folder changes nothing until you press **Check for updates**, then
**Update** on it.

## Is it maintained?

LocalAssistant asks each installed integration's site about it once a day, and
when you press **Check for updates**:

| Badge           | Meaning                                               |
| --------------- | ----------------------------------------------------- |
| Official        | Ships with LocalAssistant and is updated with it.     |
| Local folder    | Read from a folder on this server.                    |
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
