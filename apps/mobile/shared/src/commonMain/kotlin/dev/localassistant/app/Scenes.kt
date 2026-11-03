package dev.localassistant.app

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import kotlin.math.roundToInt

val climateModes = listOf("heat", "dry", "cool", "fan", "auto")

val printerCommands = listOf("pause", "resume", "stop")

val vacuumCommands = listOf("start", "pause", "dock", "stop")

private val commandWords = mapOf(
    "pause" to "Pause",
    "resume" to "Resume",
    "stop" to "Stop",
    "start" to "Start",
    "dock" to "Dock",
    "play" to "Play",
    "next" to "Skip on",
    "previous" to "Go back on",
)

/** `this` with `key` set to `value`, or without it for null. */
fun JsonObject.with(key: String, value: JsonElement?): JsonObject = JsonObject(if (value == null) this - key else this + (key to value))

/** `this` with `key` of its `change` object set to `value`, or removed for null. */
fun JsonObject.withChange(key: String, value: JsonElement?): JsonObject = with("change", (child("change") ?: JsonObject(emptyMap())).with(key, value))

/** The command that puts a device back the way `state` shows it, or null for one a scene can't set. */
fun captureCommand(state: JsonObject?): JsonObject? {
    state ?: return null
    return when (state.text("type")) {
        "switch" -> state.flag("on")?.let { on -> Api.command("switch") { put("on", on) } }
        "light" -> state.flag("on")?.let { on ->
            Api.command("light") {
                putJsonObject("change") {
                    put("on", on)
                    if (on) {
                        state.number("brightness")?.let { put("brightness", it.roundToInt()) }
                        val color = state.child("color")
                        if (color != null) put("color", color) else state.number("temperature")?.let { put("temperature", it.roundToInt()) }
                    }
                }
            }
        }
        "cover" -> state.number("position")?.let { position -> Api.command("cover") { putJsonObject("move") { put("position", position.roundToInt()) } } }
        "climate" -> Api.command("climate") {
            putJsonObject("change") {
                put("power", state.flag("power") ?: false)
                state.text("mode")?.let { put("mode", it) }
                state.number("targetTemperature")?.let { put("targetTemperature", it) }
            }
        }
        "valve" -> state.number("target")?.let { target -> Api.command("valve") { put("target", target) } }
        "fan" -> state.flag("on")?.let { on ->
            Api.command("fan") {
                putJsonObject("change") {
                    put("on", on)
                    if (on) state.number("speed")?.let { put("speed", it.roundToInt()) }
                }
            }
        }
        "lock" -> state.flag("locked")?.let { locked -> Api.command("lock") { put("locked", locked) } }
        "media" -> state.flag("power")?.let { power ->
            Api.command("media") {
                putJsonObject("change") {
                    put("power", power)
                    if (power) state.number("volume")?.let { put("volume", it.roundToInt()) }
                }
            }
        }
        else -> null
    }
}

/** The command a new scene member starts with for a device on `card`, or null when it takes none. */
fun startingCommand(card: String): JsonObject? = when (card) {
    "switch" -> Api.command("switch") { put("on", true) }
    "light", "fan" -> Api.command(card) { putJsonObject("change") { put("on", true) } }
    "cover" -> Api.command("cover") { putJsonObject("move") { put("action", "close") } }
    "climate" -> Api.command("climate") {
        putJsonObject("change") {
            put("power", true)
            put("targetTemperature", 20)
        }
    }
    "valve" -> Api.command("valve") { put("target", 19) }
    "lock" -> Api.command("lock") { put("locked", true) }
    "media" -> Api.command("media") { putJsonObject("change") { put("action", "pause") } }
    "button" -> Api.command("button")
    "printer" -> Api.command("printer") { putJsonObject("change") { put("command", "pause") } }
    "vacuum" -> Api.command("vacuum") { putJsonObject("change") { put("command", "start") } }
    else -> null
}

/** How a device should start in a scene: the way it is now, or its kind's first command. */
fun memberCommand(device: Device): JsonObject? = captureCommand(device.state) ?: startingCommand(device.card)

private fun number(value: Double): String = if (value % 1.0 == 0.0) value.toLong().toString() else value.toString()

private fun onOff(power: Boolean?, device: String, details: List<String>): String = when (power) {
    false -> "Turn $device off"
    true -> listOf("Turn $device on", *details.toTypedArray()).joinToString(" ")
    null -> listOf("Set $device", *details.toTypedArray()).joinToString(" ")
}

/** A scene member's command in words, as the web app says it: "Turn Lamp on at 40%". */
fun describeCommand(command: JsonObject, device: String): String {
    val change = command.child("change") ?: JsonObject(emptyMap())
    return when (command.text("type")) {
        "cover" -> {
            val move = command.child("move") ?: JsonObject(emptyMap())
            move.number("position")?.let { "Move $device to ${it.roundToInt()}% open" } ?: when (move.text("action")) {
                "stop" -> "Stop $device"
                "open" -> "Open $device"
                else -> "Close $device"
            }
        }
        "climate" -> onOff(
            change.flag("power"),
            device,
            listOfNotNull(change.text("mode")?.let { "in $it mode" }, change.number("targetTemperature")?.let { "at ${number(it)}°C" }),
        )
        "switch" -> onOff(command.flag("on"), device, emptyList())
        "valve" -> "Set $device to ${command.number("target")?.let(::number) ?: "?"}°C"
        "light" -> onOff(
            change.flag("on"),
            device,
            listOfNotNull(
                change.number("brightness")?.let { "at ${it.roundToInt()}%" },
                change.number("temperature")?.let { "${it.roundToInt()} K" },
                change.child("color")?.let { "in colour" },
            ),
        )
        "lock" -> "${if (command.flag("locked") == true) "Lock" else "Unlock"} $device"
        "fan" -> onOff(
            change.flag("on"),
            device,
            listOfNotNull(
                change.number("speed")?.let { "at ${it.roundToInt()}%" },
                change.flag("oscillating")?.let { if (it) "oscillating" else "still" },
            ),
        )
        "media" -> change.text("action")?.let { "${commandWords[it] ?: it} $device" } ?: onOff(
            change.flag("power"),
            device,
            listOfNotNull(change.number("volume")?.let { "at volume ${it.roundToInt()}" }, change.text("source")?.let { "on $it" }),
        )
        "button" -> "Press $device"
        "printer", "vacuum" -> change.text("command")?.let { "${commandWords[it] ?: it} $device" } ?: "Set $device"
        else -> "Set $device"
    }
}

/** A JSON number for `value`, whole when it has no fraction. */
fun jsonNumber(value: Double): JsonPrimitive = if (value % 1.0 == 0.0) JsonPrimitive(value.toLong()) else JsonPrimitive(value)

/** An empty JSON object. */
val emptyJson = buildJsonObject {}
