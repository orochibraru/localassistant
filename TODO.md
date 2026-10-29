# TODO

The only backlog. Each entry is a `- [ ]` checkbox: put `**[WIP]**` after the
box while it's being worked on, and delete the entry once it's done.

## Medium

- [ ] Python plugins only get the standard library in the image: support a
      `requirements` list in the manifest, installed into the plugin's folder.
- [ ] A plugin can only show its devices on the built-in cards: a generic
      "sensor" card driven by manifest-declared readings would cover kinds that
      fit no existing card.

- [ ] Device controls and other remote commands answer 403 "Cross-site remote
      requests are forbidden" on a built server over plain HTTP without a proxy,
      even with `ORIGIN` set: SvelteKit's remote-function origin check compares
      the browser's origin with adapter-bun's https-assumed request URL.

## Large
