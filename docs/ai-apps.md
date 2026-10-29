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

It can't add, change or remove devices, rooms or floors, and never sees your
email, the device keys, the printer's access code or the MELCloud password.
