"""A plugin that calls every host method, for the process runtime tests."""

import os
from datetime import datetime, timezone

from localassistant_plugin import PluginError, run


class Fixture:
    """Lamps that exercise the whole protocol."""

    def connect(self, context, values):
        """Refuses the bad token."""
        if values.get("token") == "bad":
            raise PluginError("The fixture refused the token.")

    def discover(self, context):
        """Finds one lamp, after asking the host for something it doesn't have."""
        try:
            context._call("nope")
        except PluginError:
            pass
        return [{"kind": "fixture-lamp", "externalId": "found-1", "name": "Found"}]

    def add(self, context, values):
        """The lamp the form describes."""
        return {"kind": "fixture-lamp", "externalId": values["serial"]}

    def start(self, context):
        """Echoes every fixture topic back on the broker."""
        context.log("info", "started", plugin="fixture")
        context.subscribe(
            "fixture/+",
            lambda topic, payload: context.publish("echo/" + topic.split("/")[1], payload.decode()),
        )

    def stop(self, context):
        """Nothing to close."""

    def read(self, context, device):
        """Calls every host method, then answers; a lamp named crash kills the process."""
        if device.field("serial") == "crash":
            os._exit(3)
        settings = context.settings() or {}
        devices = context.devices()
        same = context.device(device["id"])
        folder = context.folder("x")
        readings = context.energy_readings(device["id"])
        context.record_energy(device["id"], datetime(2026, 10, 28, 12, tzinfo=timezone.utc), len(readings) + 1.0)
        context.refresh_later(device["id"], 30)
        context.notify("Read", device["name"], audience="admins")
        context.mqtt_configured()
        return {
            "type": "switch",
            "on": device.secret("pin") == settings.get("token"),
            "power": len(devices),
            "energy": 1.0 if same and folder else 0.0,
        }

    def command(self, context, device, command):
        """Saves the new state itself and answers nothing."""
        context.save_state(device["id"], {"type": "switch", "on": command["on"], "power": None, "energy": None})

    def serve(self, context, device, request):
        """Answers with the path."""
        return {"status": 201, "headers": {"content-type": "text/plain"}, "body": request["path"]}

    def clips(self, context, device):
        """No clips."""
        return {"title": "Events", "empty": "None yet.", "clips": []}


if __name__ == "__main__":
    run(Fixture())
