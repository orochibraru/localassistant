# Routines

The server runs every routine, whether or not anyone has the app open: the
worker checks the clock-driven ones once a minute, and device routines the
moment a device reports. Everyone signed in can add, change, run or switch one
off. **Routines** has three tabs: the routines, the scenes, and the history of
every run.

## When

- **Sunrise** or **sunset**, with an offset in minutes (negative is before),
  from the home's location. Set it in **Admin**, **Homes**, **Set location**.
- **A time** on chosen weekdays, in the home's time zone.
- **The outside temperature** getting above or below a threshold. It fires once
  when it crosses, and again only after it went back by a degree.
- **A door or window opens**: one of the chosen contact sensors.
- **A device changes**: turns on or off, opens or shuts, locks or unlocks,
  starts playing, is pressed, or goes above or below a value (a sensor's
  reading, a meter's watts, a thermostat's room temperature, a light's
  brightness, a blind's position). It fires when the device gets there, not
  while it stays.
- **Someone arrives or leaves**: anyone, a given person, the first one home or
  the last one out. See "Who's home" below.

## During

All year, chosen seasons (winter is December to February, summer June to
August), or a date range that repeats every year and may wrap over New Year.

## Only if

Conditions checked when the trigger fires; if one doesn't hold, the routine
skips that time and the history says which:

- a device is on, off, open, shut, locked, playing, above or below a value;
- between two times (it may wrap over midnight);
- on chosen weekdays;
- during the day or at night, from the home's sunrise and sunset;
- who's home: somebody, nobody, or a given person home or away.

**Run now** ignores them.

## Do

Steps run one after the other:

- **Drive a device**: any device that takes a command, a light (on, off,
  brightness, white), a switch, a lock, a fan, a speaker or TV, a heat pump, a
  valve, a blind, a button, a printer or a robot vacuum;
- **Set a scene**;
- **Send a notification** to everyone, the admins or one person, with up to two
  scenes as buttons (see [Notifications](notifications.md));
- **Move blinds** of a room or every blind in the house;
- **Wait** some minutes before the next steps. Changing or switching off the
  routine cancels the steps still waiting.

A step that fails doesn't stop the next; the card and the history show what
failed.

With a door or window trigger, two more steps hold until the sensors shut:

- **Close radiator valves**: the chosen valves in the room of the sensor that
  opened close, and go back to their target once every chosen sensor there is
  shut.
- **Turn the heating down** by some degrees: the chosen heat pumps and valves in
  that room, or all of them for a door in the whole house, go back to the target
  they had once it shuts.

## Who's home

A person counts as home when a device they own says so, and away when the ones
that know all say away. An admin picks the owner in **Devices**, **Edit**,
**Whose is it**, for two kinds of devices:

- **Person trackers**: Home Assistant's people and device trackers through the
  Home Assistant integration, or any tracker announcing itself through MQTT
  discovery. They follow the person all day.
- **Phones and tablets** added from **Account**, **This device**, with the
  location shared. A web app only reports while it's open, so a phone alone says
  when someone opened the app at home, not when they walked in: pair it with a
  tracker (OwnTracks, Home Assistant's companion app) for routines that should
  fire at the door.

**Home** shows everyone who's tracked, home or away and since when.

## Scenes

A scene is a set of devices and what each one should be doing: movie night,
bedtime, away. **Add a device** brings it in the way it is now, **Use how they
are now** captures every one again, and each can be changed by hand. **Set**
puts them all that way; routines set scenes too.

## History

Every run for 30 days: what set it off, whether it ran, was skipped by a
condition, is waiting on a delay, or failed, and why.

## Presets

**New routine**, **Start from** fills the form with a ready-made routine, still
editable before saving: blinds closed at sunset and opened at sunrise in autumn
and winter, blinds closed when it gets hot in summer, radiators off while a
window is open, and the heating down while the front door is open.
