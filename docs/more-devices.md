# More devices

## Dreame robot vacuums

**Devices**, **Dreame robot vacuums**, sign in with the Dreamehome app's email,
password and region. The robots on the account come in with their state and
battery, and start, pause, stop and dock from their card. LocalAssistant signs
in the way the Dreamehome app does, over plain TLS; Dreame can refuse clients
other than its app at any time, and the error then says so.

## Mitsubishi through ESPHome

For a Mitsubishi indoor unit with an ESP32 on its CN105 port running ESPHome
with the CN105 climate and `web_server`: **Devices**, **Add through ESPHome**
with the adapter's IP address and the climate's id (its name in the YAML, in
lowercase with underscores). No cloud and no rate limit; it works when MELCloud
is down. A username and password only if `web_server` has auth.

## Phones and tablets

**Account**, **This device**, **Add to the house** puts the phone or tablet in
the current home, owned by you. While LocalAssistant is open on it, it reports
its battery every five minutes (not on iPhone and iPad, which don't share it
with web apps) and, if you share it, where it is. An admin can change whose it
is.
