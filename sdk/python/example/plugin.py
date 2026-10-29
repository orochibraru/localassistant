"""Tasmota plugs, turned on and off over your network: the Python example."""

import json
import urllib.parse
import urllib.request

from localassistant_plugin import PluginError, run


class Tasmota:
    """A Tasmota plug: read whether it's on, turn it on or off."""

    def add(self, context, values):
        """The plug the form describes, known by its address."""
        return {"kind": "tasmota-python-plug", "externalId": values["host"], "host": values["host"]}

    def read(self, context, device):
        """Whether the plug is on."""
        return self._power(device, "Power")

    def command(self, context, device, command):
        """Turns the plug on or off."""
        if command.get("type") != "switch":
            raise PluginError("A plug only turns on and off.")
        return self._power(device, "Power On" if command.get("on") else "Power Off")

    def _power(self, device, command):
        if not device.get("host"):
            raise PluginError("This plug has no address.")
        url = f"http://{device['host']}/cm?cmnd={urllib.parse.quote(command)}"
        try:
            with urllib.request.urlopen(url, timeout=10) as response:
                answer = json.load(response)
        except OSError as error:
            raise PluginError("The plug can't be reached: check its address.") from error
        return {"type": "switch", "on": answer.get("POWER") == "ON", "power": None, "energy": None}


if __name__ == "__main__":
    run(Tasmota())
