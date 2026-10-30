# More devices

## Dreame robot vacuums

**Devices**, **Dreame robot vacuums** under **Integrations**, sign in with the
Dreamehome app's email, password and region. The robots on the account come in
with their state and battery, and start, pause, stop and dock from their card.
LocalAssistant signs in the way the Dreamehome app does, over plain TLS; Dreame
can refuse clients other than its app at any time, and the error then says so.

When a robot reports an error (wheels suspended, stuck or blocked by an
obstacle, main brush wrapped, water tank empty, dirty water full, dust bag full,
washboard to clean...), its card says what it is and everyone gets a
notification with what to do, once per new error. A detergent cartridge running
low notifies too. Errors show within the two-minute polling interval.

## Mitsubishi through ESPHome

For a Mitsubishi indoor unit with an ESP32 on its CN105 port running ESPHome
with the CN105 climate and `web_server`: **Devices**, **Mitsubishi through
ESPHome** under **Integrations**, with the adapter's IP address and the
climate's id (its name in the YAML, in lowercase with underscores). No cloud and
no rate limit; it works when MELCloud is down. A username and password only if
`web_server` has auth. Units added before integrations became plugins need that
username and password typed again in their settings.

## Phones and tablets

**Account**, **This device**, **Add to the house** puts the phone or tablet in
the current home, owned by you. While LocalAssistant is open on it, it reports
its battery every five minutes (not on iPhone and iPad, which don't share it
with web apps) and, if you share it, where it is. An admin can change whose it
is.
