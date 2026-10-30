# TODO

The only backlog. Each entry is a `- [ ]` checkbox: put `**[WIP]**` after the
box while it's being worked on, and delete the entry once it's done.

## Medium

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
- [ ] Mobile app: push notifications for notification rules (FCM and APNs need
      credentials a self-hosted server doesn't have: likely a relay or polling).
