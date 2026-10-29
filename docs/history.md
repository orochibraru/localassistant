# History and logbook

The worker keeps 30 days of what the devices did, without anyone having the app
open.

## A device's history

Open a card's menu (the dots, or a tap on a small card): under its size, the
**History** shows the last 24 hours or 7 days as a graph, with **Show as a
table** for the numbers, and its latest logbook lines. The graph follows the
number the card is about:

| Device                   | Graph                          |
| ------------------------ | ------------------------------ |
| Sensor                   | Its first reading, in its unit |
| Meter, switch with power | Watts                          |
| Heat pump, valve         | Room temperature               |
| Light, fan               | Brightness, speed              |
| Blind                    | How open it is                 |
| Robot vacuum             | Battery                        |

A reading is kept at most once a minute, and every fifteen minutes when it
doesn't change.

## Logbook

**Logbook**, in the sidebar (under **More** on a phone), lists what happened,
newest first, by day:

- a light, switch, fan or heat pump turning on or off, a door opening or
  shutting, a lock locking, unlocking or jamming, a speaker playing or pausing,
  a button pressed, a vacuum or printer changing what it's doing;
- someone getting home or leaving (see "Who's home" in
  [Routines](automations.md));
- every routine run, and what failed.

A change shows once the device reports it, so a tap that a device never confirms
doesn't show.
