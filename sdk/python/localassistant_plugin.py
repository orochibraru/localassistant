"""LocalAssistant plugins in Python: one file to copy next to your plugin, standard library only.

LocalAssistant starts the plugin as a process and talks JSON-RPC to it over standard input and output. Write a class
with the hooks you need (connect, discover, add, start, stop, read, command, serve, clips) and call run() with it.
"""

import base64
import json
import sys
import threading
from datetime import datetime, timezone

PROTOCOL_VERSION = 1
HOOKS = ("connect", "discover", "add", "start", "stop", "read", "command", "serve", "clips")


class PluginError(Exception):
    """An error LocalAssistant shows the person as it is."""


class Device(dict):
    """A device as LocalAssistant hands it to the plugin: a dict with its fields, state and decrypted secrets."""

    def secret(self, name):
        """The decrypted secret field name, or None."""
        return (self.get("secrets") or {}).get(name)

    def field(self, name, default=None):
        """The plain field name, or default."""
        return (self.get("fields") or {}).get(name, default)


class Context:
    """The plugin's line to LocalAssistant: its settings, its devices, the shared MQTT broker and the log."""

    def __init__(self, output, timeout=60.0):
        """Prepares the line; run() makes the one the plugin uses."""
        self._output = output
        self._timeout = timeout
        self._write_lock = threading.Lock()
        self._pending_lock = threading.Lock()
        self._pending = {}
        self._next_id = 1_000_000
        self._handlers = {}

    def _send(self, message):
        message["jsonrpc"] = "2.0"
        with self._write_lock:
            self._output.write(json.dumps(message) + "\n")
            self._output.flush()

    def _call(self, method, params=None):
        with self._pending_lock:
            self._next_id += 1
            call_id = self._next_id
            waiter = {"event": threading.Event(), "reply": None}
            self._pending[call_id] = waiter
        self._send({"id": call_id, "method": method, "params": params or {}})
        if not waiter["event"].wait(self._timeout):
            with self._pending_lock:
                self._pending.pop(call_id, None)
            raise PluginError(f"LocalAssistant didn't answer {method} in time.")
        reply = waiter["reply"]
        if reply.get("error"):
            raise PluginError(reply["error"].get("message", "LocalAssistant refused."))
        return reply.get("result")

    def _answered(self, message):
        with self._pending_lock:
            waiter = self._pending.pop(message.get("id"), None)
        if waiter:
            waiter["reply"] = message
            waiter["event"].set()

    def log(self, level, message, **context):
        """Writes a line to LocalAssistant's log at level debug, info, warn or error."""
        self._send({"method": "log", "params": {"level": level, "message": message, "context": context}})

    def settings(self):
        """What the plugin is connected with, secrets decrypted, or None when it isn't connected."""
        return self._call("settings")

    def devices(self):
        """The plugin's devices."""
        return [Device(device) for device in self._call("devices") or []]

    def device(self, device_id):
        """One of the plugin's devices, or None."""
        found = self._call("device", {"id": device_id})
        return Device(found) if found else None

    def found(self, devices):
        """Adds or updates discovered devices, keeping the names and rooms people gave them; returns how many are new."""
        return self._call("found", {"devices": devices})

    def save_state(self, device_id, state):
        """Records what a device reports, for devices whose state the plugin pushes."""
        self._call("saveState", {"deviceId": device_id, "state": state})

    def save_error(self, device_id, message):
        """Records why a device couldn't be reached."""
        self._call("saveError", {"deviceId": device_id, "message": message})

    def refresh_later(self, device_id, delay_seconds):
        """Has the worker read a device again after delay_seconds."""
        self._call("refreshLater", {"deviceId": device_id, "delayMs": int(delay_seconds * 1000)})

    def notify(self, title, body, audience="everyone", url=None):
        """Sends a push notification to the admins or to everyone."""
        params = {"title": title, "body": body, "audience": audience}
        if url:
            params["url"] = url
        self._call("notify", params)

    def folder(self, *parts):
        """A folder of the plugin's own under the data folder, created if needed."""
        return self._call("folder", {"parts": list(parts)})

    def mqtt_configured(self):
        """Whether an admin connected the shared MQTT broker."""
        return bool(self._call("mqtt.configured"))

    def subscribe(self, topic_filter, handler):
        """Hands handler(topic, payload bytes) every message of the shared broker whose topic matches topic_filter."""
        with self._pending_lock:
            self._handlers[topic_filter] = handler
        self._call("mqtt.subscribe", {"filter": topic_filter})

    def publish(self, topic, payload):
        """Sends payload, a string or a dict sent as JSON, on topic through the shared broker."""
        text = payload if isinstance(payload, str) else json.dumps(payload)
        self._call("mqtt.publish", {"topic": topic, "payload": text})

    def energy_readings(self, device_id):
        """A meter's stored counter readings, oldest first, as dicts with hour and total."""
        return self._call("energy.readings", {"deviceId": device_id}) or []

    def record_energy(self, device_id, hour, total):
        """Stores a meter's counter, in kWh, for the hour starting at hour, a datetime."""
        stamp = hour.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        self._call("energy.record", {"deviceId": device_id, "hour": stamp, "total": total})

    def _message(self, topic, payload):
        with self._pending_lock:
            handlers = [handler for pattern, handler in self._handlers.items() if matches(pattern, topic)]
        for handler in handlers:
            handler(topic, payload)


def matches(topic_filter, topic):
    """Whether topic matches the MQTT topic_filter, with + for one level and a trailing # for the rest."""
    wanted = topic_filter.split("/")
    given = topic.split("/")
    for index, level in enumerate(wanted):
        if level == "#":
            return True
        if index >= len(given) or (level != "+" and level != given[index]):
            return False
    return len(wanted) == len(given)


def hooks_of(plugin):
    """The hooks plugin implements, as LocalAssistant names them."""
    return [hook for hook in HOOKS if callable(getattr(plugin, hook, None))]


def _dispatch(plugin, context, method, params):
    if method == "initialize":
        return {"protocolVersion": PROTOCOL_VERSION, "hooks": hooks_of(plugin)}
    hook = getattr(plugin, method, None) if method in HOOKS else None
    if not callable(hook):
        raise PluginError(f"The plugin has no {method}.")
    device = Device(params["device"]) if params.get("device") else None
    if method in ("connect", "add"):
        return hook(context, params.get("values") or {})
    if method in ("discover", "start", "stop"):
        return hook(context)
    if method == "command":
        return hook(context, device, params.get("command") or {})
    if method == "serve":
        answer = hook(context, device, {
            "path": params.get("path", ""),
            "method": params.get("method", "GET"),
            "headers": params.get("headers") or {},
        }) or {}
        body = answer.get("body", b"")
        if isinstance(body, str):
            body = body.encode()
        return {
            "status": answer.get("status", 200),
            "headers": answer.get("headers") or {},
            "body": base64.b64encode(body).decode(),
        }
    return hook(context, device)


def _handle(plugin, context, message):
    if message.get("method") == "mqtt.message":
        params = message.get("params") or {}
        context._message(params.get("topic", ""), base64.b64decode(params.get("payload", "")))
        return
    try:
        result = _dispatch(plugin, context, message["method"], message.get("params") or {})
        reply = {"id": message.get("id"), "result": result}
    except Exception as error:
        reply = {"id": message.get("id"), "error": {"code": -32000, "message": str(error) or type(error).__name__}}
    if message.get("id") is not None:
        context._send(reply)


def serve(plugin, source, output):
    """Runs plugin over the text streams source and output until source ends; each call runs on its own thread."""
    context = Context(output)
    threads = []
    for line in source:
        if not line.strip():
            continue
        try:
            message = json.loads(line)
        except ValueError:
            continue
        if "method" not in message:
            context._answered(message)
            continue
        thread = threading.Thread(target=_handle, args=(plugin, context, message), daemon=True)
        thread.start()
        threads.append(thread)
    for thread in threads:
        thread.join(1)


def run(plugin):
    """Serves plugin on standard input and output, as LocalAssistant starts it."""
    serve(plugin, sys.stdin, sys.stdout)


def now():
    """The current time in UTC, for state timestamps."""
    return datetime.now(timezone.utc)
