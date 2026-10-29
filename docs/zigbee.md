# Zigbee and Shelly

Door and window sensors, radiator valves, relays, metering plugs and the ZLinky
reader come in through [Zigbee2MQTT](https://www.zigbee2mqtt.io/), and Shelly
meters through the same MQTT broker. LocalAssistant only talks to the broker:
pair devices in Zigbee2MQTT, they show up here on their own.

## Connect the broker

**Devices**, **Zigbee (Zigbee2MQTT)**, **Connect**: the broker's address
(`mqtt://192.168.1.10:1883`), its username and password if it has them, and
Zigbee2MQTT's base topic (`zigbee2mqtt` by default). The password is stored
encrypted. The worker keeps one connection open and saves what devices report: a
door or window at once, the rest every five seconds.

| Zigbee2MQTT exposes                  | Shows as              | Controls          |
| ------------------------------------ | --------------------- | ----------------- |
| `contact`                            | Door or window sensor | Open or shut      |
| a heating setpoint                   | Radiator valve        | Target in 0.5°    |
| `state` (with `power` on plugs)      | Relay or plug         | On and off, watts |
| `current_summation_delivered`, power | Energy meter (ZLinky) | Read only         |

**Find new devices** asks Zigbee2MQTT for its list again. Renaming a device in
Zigbee2MQTT keeps it here: devices are matched on their IEEE address.

## Shelly meters

Shelly Gen2 and later devices (Pro 3EM, EM Gen3, 1PM Gen3, PM Mini) publish to
the broker once MQTT is on in their web page with **Generic status update over
MQTT** ticked. Each channel comes in as a **Shelly meter**: a three-phase Pro
3EM gives three, one per clamp. Rename them after what they measure (heat pump,
hob) and they show on **Energy**.
