# TODO

The only backlog. Each entry is a `- [ ]` checkbox: put `**[WIP]**` after the
box while it's being worked on, and delete the entry once it's done.

## Medium

- [ ] Each home's location (search by city) and the weather on Home, from
      Open-Meteo, which the automations reuse for sunrise, sunset and the
      outside temperature.
- [ ] Phones and tablets running the app as devices of a home: the owner, the
      battery (not on iPhone, which doesn't expose it) and the location while
      the app is open, once allowed.
- [ ] Dreame robot vacuums through the Dreamehome cloud on standard TLS (start,
      pause, dock, battery, state), saying so plainly when Dreame refuses
      clients other than its app.

## Large

- [ ] Automations, with a tab in the sidebar and on phones: triggers at sunrise,
      sunset, a time on chosen weekdays, or an outside temperature crossing a
      threshold; limited to seasons or date ranges; acting on blinds by room or
      house, heat pumps and printers. Run by the worker.
- [ ] Zigbee2MQTT over MQTT: door and window sensors, radiator valves, relays,
      metering plugs and the Linky reader.
- [ ] Automation presets once Zigbee is in, starting with "a window opens, its
      room's radiator valves close until it shuts".
- [ ] Energy: Shelly meters over local MQTT and metering plugs, with daily and
      monthly charts per appliance and for the house.
- [ ] Cameras: live view on Home through a go2rtc sidecar (RTSP in, WebRTC to
      the browser), for cameras with local RTSP.
- [ ] The printer's camera on its card: the P1 series streams JPEG frames over
      TLS on port 6000, not RTSP, so it needs its own small reader.
- [ ] Mitsubishi without the cloud: an ESPHome CN105 adapter on each indoor unit
      and its native API, for when MELCloud is down or rate limiting.
