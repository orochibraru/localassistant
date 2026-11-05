# More devices

## Dreame robot vacuums

**Devices**, **Add a device**, **Dreame robot vacuums**, sign in with the
Dreamehome app's email, password and region. The robots on the account come in
with their state and battery, and start, pause, stop and dock from their card.
LocalAssistant signs in the way the Dreamehome app does, over plain TLS; Dreame
can refuse clients other than its app at any time, and the error then says so.

When a robot reports an error (wheels suspended, stuck or blocked by an
obstacle, main brush wrapped, water tank empty, dirty water full, dust bag full,
washboard to clean...), its card says what it is and everyone gets a
notification with what to do, once per new error. A detergent cartridge running
low notifies too. Errors show within the two-minute polling interval.

Robots sometimes say they're stuck when they aren't. Turn on **Restart when
stuck** in the Dreame connection and a robot reporting it's stuck or blocked is
told to carry on, up to twice per clean (the count starts over once it's back on
its dock). The notification says it was restarted, or that it gave up.

## Renault cars

**Devices**, **Add a device**, **Renault (MyRenault)**, sign in with the
MyRenault app's email and password and the country the account was made in.
Every car on the account comes in, named after its model and plate, with its
battery, range, whether it's plugged in or charging (with the power and the time
to full while it charges), mileage, the outside temperature, climate control and
charge mode, as far as the model shares them. It's read only, every ten minutes:
Renault limits how often an account is read. An account that asks for a code by
email at sign-in can't be connected yet, and a car in privacy mode shares
nothing until it's turned off in the car.

## Mitsubishi through ESPHome

For a Mitsubishi indoor unit with an ESP32 on its CN105 port running ESPHome
with the CN105 climate and `web_server`: **Devices**, **Add a device**,
**Mitsubishi through ESPHome**, with the adapter's IP address and the climate's
id (its name in the YAML, in lowercase with underscores). No cloud and no rate
limit; it works when MELCloud is down. A username and password only if
`web_server` has auth. Units added before integrations became plugins need that
username and password typed again in their settings.

## Phones and tablets

**Account**, **This device**, **Add to the house** puts the phone or tablet in
the current home, owned by you. While LocalAssistant is open on it, it reports
its battery every five minutes (not on iPhone and iPad, which don't share it
with web apps) and, if you share it, where it is. An admin can change whose it
is.
