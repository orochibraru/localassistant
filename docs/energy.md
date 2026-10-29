# Energy

**Energy** charts what the house and each appliance used, per day over the last
30 days and per month over the last 12. The worker snapshots every meter's
counter every 15 minutes and keeps about two years.

The house is the whole-house meter when there is one (the ZLinky reader or a
Linky online), the sum of the metered appliances otherwise. Appliances are the
metering plugs and Shelly meters.

## Linky

Two ways, use one:

- **Live, with hardware**: a LiXee ZLinky_TIC on the meter's TIC port, paired in
  Zigbee2MQTT. Live power, and the counter every few seconds.
- **Online, no hardware**: Enedis's daily use through
  [conso.boris.sh](https://conso.boris.sh/). Sign in there with your Enedis
  account, allow it, copy the token, then **Devices**, **Linky**, **Add a Linky
  online** with the token and the 14-digit PRM (on your bill, or press + on the
  meter until it shows). The last year comes in at once, then a day behind,
  checked every six hours. The token is stored encrypted. It works whoever sells
  you the electricity (Engie, EDF, TotalEnergies): Enedis runs every Linky and
  holds the readings, the supplier only bills them.
