# Bambu Lab printers

LocalAssistant talks to a Bambu Lab printer (P1P, P1S and the other models with
the same LAN protocol) over its local MQTT broker, with the printer's access
code. No Bambu account is involved.

## What it shows and does

- The stage (idle, preparing, printing, paused, finished, failed), the file, the
  progress, the time left and the layer, and the nozzle and bed temperatures,
  live: the worker keeps a connection open and the card follows within seconds.
- Pause and resume, stop (it asks first), the chamber light, and the print speed
  (silent, standard, sport, ludicrous).

Like every control, these show on the card at once, go out after a short pause,
spin while sent, and roll back with the reason in red when the printer refuses.

## Reading needs the access code, controlling needs Developer Mode

Since Bambu's 2025 firmware (01.08.02.00 and later on the P1 series), a printer
answers status requests from any app with its access code, but only obeys
commands from third-party apps in **LAN-only mode with Developer Mode** on. In
LAN-only mode the Bambu Handy app and cloud printing stop working; printing from
Bambu Studio on the same network keeps working.

Without it, the card shows the print as usual, and pausing or stopping says the
printer refused.

## Add it

On the printer:

1. **Settings, Network**: the IP address (reserve it in your router) and the
   **Access Code**.
2. **Settings, Device** (or the label on the back): the serial number.
3. To control it: **Settings, Network, LAN Only Mode** on, then **Developer
   Mode** on.

Then **Devices, Add a printer** with the name, IP address, serial number and
access code. **Edit** changes the address or the access code later.
