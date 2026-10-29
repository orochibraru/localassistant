# Routines

The server runs every routine, whether or not anyone has the app open: the
worker checks the clock-driven ones once a minute, and door or window routines
the moment a sensor reports. Everyone signed in can add, change, run or switch
one off.

## When

- **Sunrise** or **sunset**, with an offset in minutes (negative is before),
  from the home's location. Set it in **Admin**, **Homes**, **Set location**.
- **A time** on chosen weekdays, in the home's time zone.
- **The outside temperature** getting above or below a threshold. It fires once
  when it crosses, and again only after it went back by a degree.
- **A door or window opens**: one of the chosen Zigbee contact sensors.

## During

All year, chosen seasons (winter is December to February, summer June to
August), or a date range that repeats every year and may wrap over New Year.

## Do

Steps run one after the other: blinds of a room or every blind in the house
(open, close or to a position), a heat pump (on with a mode and temperature, or
off), a printer (pause, resume, stop) or a robot vacuum (start, pause, stop,
dock). A step that fails doesn't stop the next; the card shows what failed.

With a door or window trigger, two more steps hold until the sensors shut:

- **Close radiator valves**: the chosen valves in the room of the sensor that
  opened close, and go back to their target once every chosen sensor there is
  shut.
- **Turn the heating down** by some degrees: the chosen heat pumps and valves in
  that room, or all of them for a door in the whole house, go back to the target
  they had once it shuts.

## Presets

**New routine**, **Start from** fills the form with a ready-made routine, still
editable before saving: blinds closed at sunset and opened at sunrise in autumn
and winter, blinds closed when it gets hot in summer, radiators off while a
window is open, and the heating down while the front door is open.
