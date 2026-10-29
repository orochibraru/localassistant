# Automations

The worker checks every automation once a minute, whether or not anyone has the
app open. Everyone signed in can add, change, run or switch one off.

## When

- **Sunrise** or **sunset**, with an offset in minutes (negative is before),
  from the home's location. Set it in **Admin**, **Homes**, **Set location**.
- **A time** on chosen weekdays, in the home's time zone.
- **The outside temperature** getting above or below a threshold. It fires once
  when it crosses, and again only after it went back by a degree.

## During

All year, chosen seasons (winter is December to February, summer June to
August), or a date range that repeats every year and may wrap over New Year.

## Do

Steps run one after the other: blinds of a room or every blind in the house
(open, close or to a position), a heat pump (on with a mode and temperature, or
off), a printer (pause, resume, stop) or a robot vacuum (start, pause, stop,
dock). A step that fails doesn't stop the next; the card shows what failed.

## Presets

Ready-made automations, switched on per home. **Radiators off while a window is
open** closes a room's radiator valves when a door or window sensor there opens,
and puts them back to their target once every sensor in the room is shut. It
needs the sensors and the valves in the same room.
