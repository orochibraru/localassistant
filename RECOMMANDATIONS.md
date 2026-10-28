# Gear to buy

What fits LocalAssistant best: local control, no cloud account to babysit, and
as few integrations as possible. Prices are typical street prices in France, per
unit, and move with promotions. Before buying a Zigbee device, check it on the
[Zigbee2MQTT device list](https://www.zigbee2mqtt.io/supported-devices/).

## Start here: one Zigbee stick

Door sensors, radiator valves and relays all speak Zigbee, so one USB stick
covers them and LocalAssistant needs a single integration (Zigbee2MQTT over
MQTT).

| Buy                                 | Price | Why                                                                                    |
| ----------------------------------- | ----- | -------------------------------------------------------------------------------------- |
| Sonoff ZBDongle-E (Zigbee 3.0 Plus) | ~€25  | Well supported by Zigbee2MQTT. Put it on a 1 m USB extension, away from the server box |

Mains-powered Zigbee devices (relays, plugs) relay the signal, so add them early
if the house is big.

## Door and window sensors

| Buy                                      | Price | Why                                                      |
| ---------------------------------------- | ----- | -------------------------------------------------------- |
| Aqara Door and Window Sensor (MCCGQ11LM) | ~€15  | Tiny, years on one battery, very reliable in Zigbee2MQTT |
| Sonoff SNZB-04P                          | ~€12  | Cheaper, bigger, same job                                |

Avoid Wi-Fi sensors (Tuya, Tapo T110 without its hub): they sleep between events
and can't be reached locally.

## Radiator valves

For the water radiators on the air-to-water heat pump: Zigbee thermostatic
valves, on the same stick.

| Buy          | Price | Why                                                                  |
| ------------ | ----- | -------------------------------------------------------------------- |
| Sonoff TRVZB | ~€35  | Best value, adapters for most valve bodies, good Zigbee2MQTT support |
| Bosch BTH-RA | ~€60  | Quieter, more accurate regulation                                    |
| Danfoss Ally | ~€70  | The best regulation, with "window open" detection built in           |

Check your valve body first: most take M30 × 1.5, others need the adapter that
ships in the box. Avoid Wi-Fi valves (battery) and Netatmo or Tado (their hub
and cloud).

With a heat pump, keep at least one radiator (often the bathroom's) without a
valve, or never closed, so water always flows: the pump stops or short-cycles
when every valve shuts at once.

## 220 V relays and plugs

### Zigbee (same stick)

| Buy                  | Price | Why                                                           |
| -------------------- | ----- | ------------------------------------------------------------- |
| Sonoff ZBMINIR2      | ~€15  | In-wall relay, needs a neutral, also relays the Zigbee signal |
| Sonoff ZBMINI-L2     | ~€15  | In-wall relay for lights where there's no neutral             |
| IKEA INSPELNING plug | ~€10  | Plug with energy metering                                     |

### Wi-Fi, where Zigbee doesn't reach

| Buy             | Price | Why                                                                    |
| --------------- | ----- | ---------------------------------------------------------------------- |
| Shelly 1PM Gen3 | ~€20  | Local HTTP and MQTT out of the box, no account needed, energy metering |

For heavy loads (a 3 kW water heater, a heat pump circuit), have an electrician
drive a modular contactor from the relay instead of switching the load directly.

## Energy monitoring

Pick by how the appliance is powered.

### Plugged in: metering plugs

For the washing machine, the dryer, the dishwasher, the server and the Mac. Take
16 A plugs: a dryer or a washing machine heating water draws up to about 3,500
W.

| Buy             | Price | Why                                                           |
| --------------- | ----- | ------------------------------------------------------------- |
| Sonoff S60ZBTPF | ~€15  | Zigbee, 16 A, power and energy, also relays the Zigbee signal |
| Nous A1Z        | ~€15  | Zigbee, 16 A, power and energy, a smaller body                |

Check the dryer and washing machine plugs are rated 16 A before buying; the
low-power ones (server, Mac) can take any metering plug.

### Hardwired: clamps in the electrical panel

For the heat pump and the induction hob, which sit on their own circuits (16 to
32 A) and have no plug. An electrician clips current clamps around their wires
in the panel; nothing is cut.

| Buy            | Price | Why                                                                               |
| -------------- | ----- | --------------------------------------------------------------------------------- |
| Shelly Pro 3EM | ~€120 | DIN rail, three clamps: heat pump, hob and one more circuit; local MQTT, Ethernet |
| Shelly EM Gen3 | ~€50  | Two clamps, for when the heat pump and the hob are all you want to watch          |

### The whole house: the Linky meter

| Buy              | Price | Why                                                                                         |
| ---------------- | ----- | ------------------------------------------------------------------------------------------- |
| LiXee ZLinky_TIC | ~€50  | Zigbee reader plugged into the Linky's TIC port: the whole house's live power and daily use |

Subtract the metered appliances from it to see the rest of the house.

## Cameras

| Buy                       | Price | Why                                                              |
| ------------------------- | ----- | ---------------------------------------------------------------- |
| Tapo C200 / C210 (indoor) | ~€30  | RTSP on the LAN once you create a Camera Account in the Tapo app |
| Tapo C220 (indoor, 2K)    | ~€40  | Same, sharper                                                    |
| Tapo C320WS (outdoor)     | ~€55  | Same, weatherproof                                               |
| Reolink RLC-510A (PoE)    | ~€60  | Wired, better image, RTSP and ONVIF without any account          |

Avoid battery cameras (Tapo C400/C420/C425, the D230 doorbell): no RTSP, and
they sleep. Avoid Ring, Nest and Arlo: cloud only.

## What LocalAssistant supports today

Tuya blinds, Mitsubishi heat pumps (MELCloud) and Bambu Lab printers. The Zigbee
devices above come with the Zigbee2MQTT integration, the Shelly meters with
their local MQTT, energy charts after that, and the cameras with the go2rtc live
view, all on the backlog.
