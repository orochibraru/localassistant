# Mitsubishi heat pumps

Mitsubishi Electric units with a Wi-Fi adapter (MAC-567IF and friends) are
driven through MELCloud, with the account the MELCloud app uses. The password is
stored encrypted with `AUTH_SECRET` and never shown again.

## Connect

**Devices**, **Mitsubishi (MELCloud)** under **Integrations**, sign in with the
MELCloud email and password. Every unit on the account is added:

- **Air-to-air** (split units): power, mode (heat, dry, cool, fan, and auto when
  the model has it), target temperature in half degrees, room temperature.
- **Air-to-water** (Ecodan): power and the zone 1 target and room temperature,
  and, with a hot water tank, its temperature and a **Boost hot water** switch
  (MELCloud's forced hot water mode).

Every control answers at once on the card and goes out as one command once you
stop tapping; a spinner shows while it's sent. If MELCloud refuses it, the card
goes back to what the unit last reported and says why in red.

**Find new units** adds units added to the account later; **Disconnect** removes
the account and its units.

## Limits

MELCloud is a cloud service: when it's down, so is heating control. It also rate
limits accounts that poll too often, which is why units are read every two
minutes. Accounts moved to MELCloud Home use a different service and aren't
supported.
