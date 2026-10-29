# Tuya blinds

LocalAssistant talks to each blind directly on your network with the Tuya local
protocol, encrypted with the blind's own local key. The Tuya cloud is only
needed once, to read that key.

## Get the device ID and local key

1. Create a free account on the [Tuya IoT Platform](https://iot.tuya.com).
2. **Cloud, Development, Create Cloud Project**: any name, the _Smart Home_
   development method, and your data center (_Central Europe_ for an account
   made in France).
3. In the project, **Devices, Link App Account**, then scan the QR code with the
   Smart Life or Tuya Smart app the blinds are paired with. Every device shows
   up with its **Device ID**.
4. **Cloud, API Explorer**, then **Device Management, Query device details**
   with a device ID: the answer's `local_key` is the key.

Re-pairing a blind in the app gives it a new local key: copy it again.

## Add it

**Devices**, **Tuya blinds** under **Integrations**, then **Add the blind**: a
name, the blind's IP address (reserve it in your router), the device ID, the
local key, and the protocol version. Most blinds speak 3.3; newer ones 3.4 or
3.5, shown as `version` in the device details.

A blind's **Edit** changes its address, protocol version or local key later. If
the position reads backwards (closed shows as open), check **It reports 100%
when closed** there.

## What it uses

The standard Tuya curtain functions by default: data point 1 to open, close and
stop, 2 to set the position, 3 to read it. A blind that reports "Position
unknown" or ignores commands uses others: the **Data points** fields of the add
and edit forms take them, from the device's functions in the Tuya IoT Platform.
