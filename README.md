<!-- markdownlint-disable MD041 -->

![LocalAssistant: your blinds and heat pumps on one page](docs/images/feature.webp)

# LocalAssistant

Your Tuya blinds and Mitsubishi heat pumps on one page, on a server you run. A
small, self-hosted alternative to Home Assistant that installs on your phone
like an app.

## What it does

- **Tuya blinds over your network**: open, close, stop or move to a position,
  straight to the motor with its local key. No Tuya cloud at runtime.
- **Mitsubishi heat pumps through MELCloud**: power, mode and target temperature
  for air-to-air units; power, zone 1 temperature and hot water boost for
  air-to-water (Ecodan) units; the room temperature for both.
- **Instant controls**: every tap shows on the card at once and goes out as one
  command when you stop, with a spinner while it's sent and no pop-ups.
- **Always current**: a background worker reads every device every two minutes,
  re-reads a blind once it stopped moving, and pushes the admins a notification
  when a device has been unreachable for an hour.
- **Accounts for the household**, invite-only, administered from the app: the
  admin adds devices, everyone signed in drives them. Authenticator apps,
  passkeys, single sign-on and email sign-in when you want them.
- **Installable on phones**, with a desktop layout that uses the screen.

## Documentation

The full documentation lives in [`docs/`](docs/): install and configuration,
first run, and how to get each device's credentials.

## Install

LocalAssistant is one container and one SQLite file. The image,
[`docker.io/orochibraru/localassistant`](https://hub.docker.com/r/orochibraru/localassistant),
is built for `linux/amd64` and `linux/arm64`.

```bash
mkdir localassistant && cd localassistant
curl -fsSLO https://raw.githubusercontent.com/orochibraru/localassistant/main/compose.prod.yaml
printf 'AUTH_SECRET=%s\nORIGIN=http://192.168.1.10:3000\n' "$(openssl rand -base64 32)" > .env
docker compose -f compose.prod.yaml up -d
```

Run it on a machine in the same network as the blinds: the container talks to
them directly. Keep `AUTH_SECRET` with your backups: it signs sessions and
encrypts the Tuya keys and the MELCloud password stored in the database.

Behind an HTTPS reverse proxy that sets `X-Forwarded-Proto` and
`X-Forwarded-Host`, leave `ORIGIN` empty. On plain HTTP with no proxy, `ORIGIN`
must be the exact URL you open, or every form is refused as cross-site.

Every variable is in [Configuration](docs/configuration.md).

### First run

Every page sends a fresh instance to the setup screen, which asks for the code
the server's log shows:

```bash
docker compose -f compose.prod.yaml logs localassistant | grep "Setup code"
```

Enter it, then create your account: it's the admin. Then **Admin, Devices**:
connect MELCloud, add each blind. See [First run](docs/first-run.md).

### Upgrades

```bash
docker compose -f compose.prod.yaml pull
docker compose -f compose.prod.yaml up -d
```

Migrations run at boot. Your data is the `localassistant` volume.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
