# Install

LocalAssistant is one container. Its `/data` volume holds the SQLite database:
accounts, devices and their encrypted keys. Back it up with `AUTH_SECRET`.

## Docker Compose

```bash
mkdir localassistant && cd localassistant
curl -fsSLO https://raw.githubusercontent.com/orochibraru/localassistant/main/compose.prod.yaml
printf 'AUTH_SECRET=%s\nORIGIN=http://192.168.1.10:3000\n' "$(openssl rand -base64 32)" > .env
docker compose -f compose.prod.yaml up -d
```

## Network

The server opens TCP connections to each blind on port 6668, so the host must
reach the blinds' addresses. Docker's default bridge network does: outgoing
connections to your LAN are routed through the host. Give every blind a fixed
address in your router (a DHCP reservation), since LocalAssistant connects to
the address you typed.

Printers are reached on port 8883 (MQTT over TLS). MELCloud is reached at
`app.melcloud.com` over HTTPS.

## Behind a proxy

Put it behind an HTTPS reverse proxy that sets `X-Forwarded-Proto` and
`X-Forwarded-Host`, and leave `ORIGIN` empty. Passkeys and installing the app on
a phone both need HTTPS. On plain HTTP with no proxy, set `ORIGIN` to the exact
URL you open.

## The image

`docker.io/orochibraru/localassistant`, for `linux/amd64` and `linux/arm64`:
Alpine and two compiled Bun binaries, the server and the background worker it
starts. `latest` is the last release, `canary` the last merge.
