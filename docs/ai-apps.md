# AI apps

Claude, ChatGPT and Gemini can see your house and drive its devices through
LocalAssistant's MCP server at `/mcp`. Each person connects their own app; it
acts as them.

## Connect one

**Account, AI apps** shows the server address. Add it as a custom connector in
Claude, an app in ChatGPT, or a connected app in Gemini. The app sends you here
to sign in and asks you to allow it; its access lasts 30 days and can be revoked
from the same page sooner.

The server must be on HTTPS: AI apps refuse anything else (localhost works while
developing). Apps identify themselves with a client metadata document (CIMD) or
register on the fly; either way you approve each one.

## What it can do

- See the floors, rooms and outside spaces, and every device with its room, last
  reading and whether it answers.
- Open, close, stop or move a blind, or every blind in a room at once.
- Turn a heat pump on or off, set its mode and temperature, boost the hot water.
- Pause, resume or stop a print, and set the printer's light and speed. It's
  told to ask before stopping a print.
- Start, pause, stop or dock a robot vacuum.
- Turn switches, lights, fans and speakers on or off and adjust them, lock or
  unlock a door, press a button.
- List the scenes and set one.

It only sees the devices **Admin**, **AI** lets AI see. It can't add, change or
remove devices, rooms or floors, and never sees your email, the device keys, the
printer's access code or the MELCloud password.

## The assistant in the app

**Assistant**, in the sidebar (under **More** on a phone), is a chat built into
LocalAssistant: ask what's on, who's home, or tell it to close the blinds or set
a scene. It reads the house and drives devices as the person asking, and says
what it did under its answer.

It runs on Claude through Anthropic's API, so an admin turns it on with an API
key: make one at console.anthropic.com, then **Admin**, **AI**, **Claude API
key**. LocalAssistant checks the key and stores it encrypted; usage is billed to
that Anthropic account. **Remove the key** turns the assistant off.

## What AI can see

**Admin**, **AI**, **What AI can see** lists every device with a switch. A
device turned off there is hidden from the assistant and from the AI apps
connected above: they don't see it in the house and can't read or drive it.
