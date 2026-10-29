# Weather

Home opens on the time and the weather: the temperature, what it feels like,
today's low and high, sunrise and sunset. The weather comes from Open-Meteo,
free and without a key.

Where it's for, the first that applies:

1. The home's place, picked in **Admin**, **Homes**, **Set location**. The
   server reads it every 15 minutes, and the time on Home follows that place's
   time zone. Sunrise and sunset automations need it.
2. The browser's own location, when the home has no place. Home asks for it,
   reads the weather every 10 minutes while it's open, and shows the time where
   you are. Only rounded coordinates reach the server, and nothing is saved.

**Clear the location** in the same menu goes back to the browser's location. The
wall panel only shows the home's place.
