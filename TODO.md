# TODO

The only backlog. Each entry is a `- [ ]` checkbox: put `**[WIP]**` after the
box while it's being worked on, and delete the entry once it's done.

## Medium

- [ ] `bunx prek run --all-files` fails in the `lint` hook: 31 `bun lint` errors
      across untouched TypeScript (complexity, require-await,
      no-floating-promises, no-named-as-default-member). Find whether a lockfile
      drift brought new rules, then fix or configure them.

- [ ] Python plugins only get the standard library in the image: support a
      `requirements` list in the manifest, installed into the plugin's folder.
- [ ] A plugin can only show its devices on the built-in cards: a generic
      "sensor" card driven by manifest-declared readings would cover kinds that
      fit no existing card.

## Large

- [ ] Mobile app: report presence in the background (WorkManager with background
      location on Android, significant-change monitoring on iOS); today it only
      reports while open.
- [ ] Mobile app: signed release builds attached to each release, like
      Penombre's `mobile.yaml`, and store listings.
- [ ] Mobile app: instant notifications on iPhone; they're checked in the
      background today, since APNs needs a relay holding the app's Apple key.
