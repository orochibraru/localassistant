package dev.localassistant.app

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlin.math.roundToInt

/** A boolean field of a state, or null. */
fun JsonObject.flag(key: String): Boolean? = (get(key) as? JsonPrimitive)?.booleanOrNull

/** A number field of a state, or null. */
fun JsonObject.number(key: String): Double? = (get(key) as? JsonPrimitive)?.doubleOrNull

/** A text field of a state, or null. */
fun JsonObject.text(key: String): String? = (get(key) as? JsonPrimitive)?.takeIf { it.isString }?.content

/** An object field of a state, or null. */
fun JsonObject.child(key: String): JsonObject? = get(key) as? JsonObject

/** `first` with `second`'s fields on top; a `change` object in both is merged field by field. */
fun mergeCommands(first: JsonObject, second: JsonObject): JsonObject {
    val merged = first.toMutableMap()
    for ((key, value) in second) {
        val earlier = merged[key]
        merged[key] = if (key == "change" && earlier is JsonObject && value is JsonObject) JsonObject(earlier + value) else value
    }
    return JsonObject(merged)
}

/**
 * Device controls as the web app has them: a change shows at once, taps within [delayMillis] go out as one command,
 * and a failure falls back to the last reading with the reason.
 */
class PendingChanges(
    private val scope: CoroutineScope,
    private val delayMillis: Long = 400,
    private val send: suspend (deviceId: String, command: JsonObject) -> Unit,
) {
    data class Entry(val patch: JsonObject, val command: JsonObject, val sending: Boolean = false, val sent: Boolean = false, val error: String? = null)

    val entries = MutableStateFlow<Map<String, Entry>>(emptyMap())
    private val timers = mutableMapOf<String, Job>()

    /** Shows `patch` on the device at once and schedules `command`, merged with any not sent yet. */
    fun change(deviceId: String, patch: JsonObject, command: JsonObject) {
        entries.update { all ->
            val earlier = all[deviceId]?.takeIf { it.error == null && !it.sending && !it.sent }
            val shown = JsonObject((all[deviceId]?.takeIf { it.error == null }?.patch ?: JsonObject(emptyMap())) + patch)
            all + (deviceId to Entry(shown, earlier?.let { mergeCommands(it.command, command) } ?: command))
        }
        timers[deviceId]?.cancel()
        timers[deviceId] = scope.launch {
            delay(delayMillis)
            flush(deviceId)
        }
    }

    /** The device's state with its pending change on top. */
    fun stateOf(device: Device): JsonObject? {
        val patch = entries.value[device.id]?.takeIf { it.error == null }?.patch ?: return device.state
        return JsonObject((device.state ?: JsonObject(emptyMap())) + patch)
    }

    /** Forgets the changes a fresh reading now shows, keeping those still in flight and the failures. */
    fun settle() {
        entries.update { all -> all.filterValues { !it.sent } }
    }

    private suspend fun flush(deviceId: String) {
        val entry = entries.value[deviceId] ?: return
        entries.update { it + (deviceId to entry.copy(sending = true)) }
        val failure = runCatching { send(deviceId, entry.command) }.exceptionOrNull()
        entries.update { all ->
            val current = all[deviceId]
            when {
                current == null || current.command != entry.command || !current.sending -> all
                failure == null -> all + (deviceId to current.copy(sending = false, sent = true))
                else -> all + (deviceId to current.copy(sending = false, error = failure.message ?: "The device didn't answer."))
            }
        }
    }
}

private fun degrees(value: Double?) = value?.let { "${(it * 2).roundToInt() / 2.0}°".replace(".0°", "°") }

private fun watts(value: Double?) = value?.let { if (it >= 1000) "${(it / 100).roundToInt() / 10.0} kW" else "${it.roundToInt()} W" }

private fun reading(element: JsonElement?): String? = when (element) {
    null, JsonNull -> null
    is JsonPrimitive -> element.booleanOrNull?.let { if (it) "Yes" else "No" } ?: element.doubleOrNull?.let { if (it % 1.0 == 0.0) it.toLong().toString() else ((it * 10).roundToInt() / 10.0).toString() } ?: element.content
    else -> null
}

/** One line saying what `state` of a `card` device shows, like its card on the web. */
fun summary(card: String, state: JsonObject?, error: String? = null): String {
    if (state == null) return error ?: "No reading yet"
    val on = state.flag("on")
    return when (card) {
        "cover" -> state.number("position")?.let { if (it <= 0.0) "Closed" else if (it >= 100.0) "Open" else "${it.roundToInt()}% open" } ?: "Position unknown"
        "climate" -> if (state.flag("offline") == true) "Offline" else listOfNotNull(
            if (state.flag("power") == true) state.text("mode")?.replaceFirstChar { it.uppercase() } ?: "On" else "Off",
            degrees(state.number("targetTemperature"))?.let { "set $it" },
            degrees(state.number("roomTemperature"))?.let { "room $it" },
        ).joinToString(" · ")
        "switch" -> listOfNotNull(if (on == true) "On" else if (on == false) "Off" else null, watts(state.number("power"))).joinToString(" · ").ifEmpty { "Unknown" }
        "light" -> when (on) {
            true -> state.number("brightness")?.let { "On · ${it.roundToInt()}%" } ?: "On"
            false -> "Off"
            null -> "Unknown"
        }
        "lock" -> if (state.flag("jammed") == true) "Jammed" else when (state.flag("locked")) {
            true -> "Locked"
            false -> "Unlocked"
            null -> "Unknown"
        }
        "fan" -> when (on) {
            true -> state.number("speed")?.let { "On · ${it.roundToInt()}%" } ?: "On"
            false -> "Off"
            null -> "Unknown"
        }
        "media" -> if (state.flag("power") == false) "Off" else listOfNotNull(state.text("title"), state.text("artist")).joinToString(" · ").ifEmpty { state.text("playback")?.replaceFirstChar { it.uppercase() } ?: "On" }
        "valve" -> listOfNotNull(degrees(state.number("temperature")), degrees(state.number("target"))?.let { "set $it" }).joinToString(" · ").ifEmpty { "Unknown" }
        "contact" -> when (state.flag("open")) {
            true -> "Open"
            false -> "Closed"
            null -> "Unknown"
        }
        "meter" -> watts(state.number("power")) ?: "No reading"
        "linky" -> state.number("kilowattHours")?.let { "${(it * 10).roundToInt() / 10.0} kWh" } ?: "No reading"
        "sensor" -> (state["readings"] as? JsonArray)?.mapNotNull { entry ->
            val row = entry as? JsonObject ?: return@mapNotNull null
            reading(row["value"])?.let { value -> listOfNotNull(value, row.text("unit")).joinToString(" ") }
        }?.take(2)?.joinToString(" · ")?.ifEmpty { null } ?: "No reading"
        "printer" -> listOfNotNull(state.text("stage")?.replaceFirstChar { it.uppercase() }, state.number("progress")?.let { "${it.roundToInt()}%" }).joinToString(" · ")
        "vacuum" -> listOfNotNull(state.text("stage")?.replaceFirstChar { it.uppercase() }, state.number("battery")?.let { "${it.roundToInt()}%" }).joinToString(" · ")
        "camera" -> if (state.flag("recording") == true) "Recording" else if (state.flag("streaming") == true) "Live" else "Idle"
        "button" -> "Tap to press"
        "presence" -> when (state.flag("home")) {
            true -> "Home"
            false -> state.text("zone") ?: "Away"
            null -> "Unknown"
        }
        "app" -> state.number("battery")?.let { "${it.roundToInt()}%${if (state.flag("charging") == true) ", charging" else ""}" } ?: "No battery reading"
        else -> error ?: "No reading yet"
    }
}

/** Whether a `card` device reads as on, lit, open or active, for the card's highlight. */
fun active(card: String, state: JsonObject?): Boolean {
    state ?: return false
    return when (card) {
        "cover" -> (state.number("position") ?: 0.0) > 0.0
        "climate" -> state.flag("power") == true
        "lock" -> state.flag("locked") == false
        "contact" -> state.flag("open") == true
        "media" -> state.text("playback") == "playing"
        "camera" -> state.flag("recording") == true
        "presence" -> state.flag("home") == true
        else -> state.flag("on") == true
    }
}

/** The sensor readings of a state, as label and value. */
fun readings(state: JsonObject?): List<Pair<String, String>> = (state?.get("readings") as? JsonArray)?.mapNotNull { entry ->
    val row = runCatching { entry.jsonObject }.getOrNull() ?: return@mapNotNull null
    val value = reading(row["value"]) ?: return@mapNotNull null
    (row.text("name") ?: "") to listOfNotNull(value, row.text("unit")).joinToString(" ")
} ?: emptyList()

/** Whether a state lists `feature` among its `features`. */
fun JsonObject.supports(feature: String): Boolean = (get("features") as? JsonArray)?.jsonArray?.any { (it as? JsonPrimitive)?.content == feature } == true
