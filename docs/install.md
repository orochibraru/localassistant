# Install

LocalAssistant is one container. Its `/data` volume holds the SQLite database:
accounts, devices, their encrypted keys and installed plugins. Back it up with
`AUTH_SECRET`.

## Docker Compose

Save this as `compose.yaml` in a folder of its own:

```yaml
services:
  localassistant:
    image: docker.io/orochibraru/localassistant:latest
    restart: unless-stopped
    ports:
      - 3000:3000
    volumes:
      - localassistant:/data
    environment:
      AUTH_SECRET: ${AUTH_SECRET:?set AUTH_SECRET, e.g. openssl rand -base64 32}
      ORIGIN: ${ORIGIN:-}

volumes:
  localassistant: {}
```

Then, in that folder:

```bash
printf 'AUTH_SECRET=%s\nORIGIN=http://192.168.1.10:3000\n' "$(openssl rand -base64 32)" > .env
docker compose up -d
```

## Network

The server opens TCP connections to each blind on port 6668, so the host must
reach the blinds' addresses. Docker's default bridge network does: outgoing
connections to your LAN are routed through the host. Give every blind a fixed
address in your router (a DHCP reservation), since LocalAssistant connects to
the address you typed.

Printers are reached on port 8883 (MQTT over TLS). MELCloud is reached at
`app.melcloud.com` over HTTPS. Installing or checking a community plugin reaches
GitHub over HTTPS.

## Behind a proxy

Put it behind an HTTPS reverse proxy that sets `X-Forwarded-Proto` and
`X-Forwarded-Host`, and leave `ORIGIN` empty. Passkeys and installing the app on
a phone both need HTTPS. On plain HTTP with no proxy, set `ORIGIN` to the exact
URL you open.

## The image

`docker.io/orochibraru/localassistant`, for `linux/amd64` and `linux/arm64`:
Alpine with ffmpeg and Python 3 (for plugins written in Python) and two compiled
Bun binaries, the server and the background worker it starts. `latest` is the
last release, `canary` the last merge.
