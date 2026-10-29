"""Tests for the Python SDK, with a fake LocalAssistant on the other end of two pipes."""

import base64
import io
import json
import os
import threading
import unittest
from datetime import datetime, timezone

import localassistant_plugin as sdk


class Lamp:
    """A plugin with most hooks, for the tests."""

    def __init__(self):
        """Keeps what the subscription hears."""
        self.heard = []

    def add(self, context, values):
        """Refuses a lamp with no serial."""
        if not values.get("serial"):
            raise sdk.PluginError("Type the serial.")
        return {"kind": "demo-lamp", "externalId": values["serial"]}

    def start(self, context):
        """Subscribes to every lamp."""
        context.subscribe("lamps/+", lambda topic, payload: self.heard.append((topic, payload)))

    def read(self, context, device):
        """On when the PIN matches the token."""
        return {"type": "switch", "on": context.settings()["token"] == device.secret("pin")}

    def command(self, context, device, command):
        """Echoes the command."""
        return {"type": "switch", "on": command["on"]}

    def serve(self, context, device, request):
        """Answers with the path."""
        return {"headers": {"content-type": "text/plain"}, "body": request["path"]}


class Host:
    """The LocalAssistant end of the conversation."""

    def __init__(self, plugin):
        """Starts the SDK on a thread, wired to two pipes."""
        to_sdk_read, self._to_sdk = os.pipe()
        self._from_sdk, from_sdk_write = os.pipe()
        self._writer = os.fdopen(self._to_sdk, "w")
        self._reader = os.fdopen(self._from_sdk, "r")
        source = os.fdopen(to_sdk_read, "r")
        output = os.fdopen(from_sdk_write, "w")
        self._thread = threading.Thread(target=sdk.serve, args=(plugin, source, output), daemon=True)
        self._thread.start()
        self._next = 0

    def write(self, message):
        """Sends one message to the SDK."""
        message["jsonrpc"] = "2.0"
        self._writer.write(json.dumps(message) + "\n")
        self._writer.flush()

    def read(self):
        """Reads one message from the SDK."""
        return json.loads(self._reader.readline())

    def call(self, method, params=None):
        """Calls a hook and returns the SDK's reply."""
        self._next += 1
        self.write({"id": self._next, "method": method, "params": params or {}})
        return self.read()

    def close(self):
        """Ends the conversation."""
        self._writer.close()
        self._thread.join(2)


class SdkTest(unittest.TestCase):
    """The SDK end to end, and its helpers."""

    def test_hooks_and_calls(self):
        """Answers initialize with its hooks, runs them, calls back and forwards MQTT messages."""
        plugin = Lamp()
        host = Host(plugin)
        hooks = host.call("initialize", {"protocolVersion": 1})["result"]["hooks"]
        self.assertEqual(hooks, ["add", "start", "read", "command", "serve"])
        self.assertEqual(
            host.call("add", {"values": {"serial": "L1"}})["result"],
            {"kind": "demo-lamp", "externalId": "L1"},
        )
        self.assertEqual(host.call("add", {"values": {}})["error"]["message"], "Type the serial.")
        self.assertIn("has no clips", host.call("clips")["error"]["message"])

        host.write({"id": 50, "method": "read", "params": {"device": {"id": "d1", "secrets": {"pin": "1234"}}}})
        asked = host.read()
        self.assertEqual(asked["method"], "settings")
        host.write({"id": asked["id"], "result": {"token": "1234"}})
        self.assertEqual(host.read(), {"jsonrpc": "2.0", "id": 50, "result": {"type": "switch", "on": True}})

        self.assertEqual(
            host.call("command", {"device": {"id": "d1"}, "command": {"type": "switch", "on": False}})["result"],
            {"type": "switch", "on": False},
        )
        served = host.call("serve", {"device": {"id": "d1"}, "path": "a/b.txt"})["result"]
        self.assertEqual(served["status"], 200)
        self.assertEqual(base64.b64decode(served["body"]), b"a/b.txt")

        host.write({"id": 60, "method": "start", "params": {}})
        subscribe = host.read()
        self.assertEqual(subscribe["method"], "mqtt.subscribe")
        host.write({"id": subscribe["id"], "result": None})
        self.assertEqual(host.read()["id"], 60)
        host.write({
            "method": "mqtt.message",
            "params": {"topic": "lamps/desk", "payload": base64.b64encode(b"on").decode()},
        })
        host.write({"method": "mqtt.message", "params": {"topic": "other/desk", "payload": ""}})
        self.assertEqual(host.call("command", {"command": {"on": True}})["result"], {"type": "switch", "on": True})
        self.assertEqual(plugin.heard, [("lamps/desk", b"on")])
        host.close()

    def test_context_calls(self):
        """Every host call sends the right method and reads the answer back."""
        output = io.StringIO()
        context = sdk.Context(output, timeout=0.05)
        answers = {
            "devices": [{"id": "d1", "fields": {"serial": "L1"}}],
            "device": None,
            "found": 2,
            "folder": "/data/plugin-data/demo/x",
            "mqtt.configured": True,
            "energy.readings": [{"hour": "2026-10-28T12:00:00Z", "total": 3.5}],
        }

        def reply():
            while True:
                lines = output.getvalue().splitlines()
                if lines:
                    sent = json.loads(lines[-1])
                    if "id" in sent and sent["id"] in context._pending:
                        context._answered({"id": sent["id"], "result": answers.get(sent["method"])})
                        return
                threading.Event().wait(0.001)

        def answered(call):
            thread = threading.Thread(target=reply)
            thread.start()
            result = call()
            thread.join()
            return result

        devices = answered(context.devices)
        self.assertEqual(devices[0].field("serial"), "L1")
        self.assertIsNone(devices[0].field("other"))
        self.assertIsNone(devices[0].secret("pin"))
        self.assertIsNone(answered(lambda: context.device("gone")))
        self.assertEqual(answered(lambda: context.found([{"kind": "demo-lamp", "externalId": "x"}])), 2)
        self.assertEqual(answered(lambda: context.folder("x")), "/data/plugin-data/demo/x")
        self.assertTrue(answered(context.mqtt_configured))
        self.assertEqual(answered(lambda: context.energy_readings("d1"))[0]["total"], 3.5)
        for call in (
            lambda: context.save_state("d1", {"type": "switch", "on": True}),
            lambda: context.save_error("d1", "unreachable"),
            lambda: context.refresh_later("d1", 1.5),
            lambda: context.notify("Hi", "There", url="/devices"),
            lambda: context.publish("lamps/desk", {"state": "ON"}),
            lambda: context.record_energy("d1", datetime(2026, 10, 28, 12, tzinfo=timezone.utc), 1.5),
        ):
            answered(call)
        context.log("info", "hello", device="d1")
        self.assertIn('"method": "log"', output.getvalue())
        with self.assertRaises(sdk.PluginError):
            context.settings()
        context._answered({"id": 1, "result": None})

    def test_refusals_and_helpers(self):
        """Host errors become PluginError; topics match MQTT wildcards."""
        output = io.StringIO()
        context = sdk.Context(output)
        thread = threading.Thread(target=lambda: context._answered({"id": context._next_id, "error": {"message": "No."}}))

        def refuse():
            threading.Event().wait(0.01)
            thread.start()

        threading.Thread(target=refuse).start()
        with self.assertRaisesRegex(sdk.PluginError, "No."):
            context.settings()
        self.assertTrue(sdk.matches("a/+/c", "a/b/c"))
        self.assertTrue(sdk.matches("a/#", "a/b/c"))
        self.assertFalse(sdk.matches("a/+", "a/b/c"))
        self.assertFalse(sdk.matches("a/b", "a"))
        self.assertEqual(sdk.now().tzinfo, timezone.utc)


if __name__ == "__main__":
    unittest.main()
