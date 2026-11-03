package dev.localassistant.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.VolumeOff
import androidx.compose.material.icons.automirrored.rounded.VolumeUp
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import kotlin.math.roundToInt

val printerSpeeds = listOf(1 to "Silent", 2 to "Standard", 3 to "Sport", 4 to "Ludicrous")

val vacuumModes = listOf("vacuum" to "Vacuum", "mop" to "Mop", "both" to "Both")

val vacuumSuctions = listOf("quiet" to "Quiet", "standard" to "Standard", "strong" to "Strong", "max" to "Max")

val vacuumCleanGenius = listOf("off" to "Off", "routine" to "Routine", "deep" to "Deep")

val vacuumParts = listOf(
    "mainBrush" to "Main brush",
    "sideBrush" to "Side brush",
    "filter" to "Filter",
    "mopPads" to "Mop pads",
    "silverIon" to "Silver ion",
    "detergent" to "Detergent",
)

private val dockLabels = mapOf("ok" to "OK", "low" to "Low", "full" to "Full or out", "missing" to "Missing", "check" to "Check it", "off" to "Off")

/** A print's time left in words, as the web says it: "2 h 05 min", "12 min". */
fun timeLeft(minutes: Int): String = if (minutes >= 60) "${minutes / 60} h ${(minutes % 60).toString().padStart(2, '0')} min" else "$minutes min"

/** A device full screen: what it reads, every control its kind has, and its settings for an admin. */
@Composable
fun DeviceScreen(model: HouseModel, device: Device, onBack: () -> Unit, onSettings: (() -> Unit)?) {
    val entry = model.pending.entries.collectAsState().value[device.id]
    val state = model.pending.stateOf(device)
    PlatformBack(true, onBack)
    Column(Modifier.fillMaxSize()) {
        ScreenBar(device.name, onBack) {
            if (entry?.sending == true) CircularProgressIndicator(Modifier.padding(end = 8.dp).size(20.dp), strokeWidth = 2.dp)
            if (onSettings != null) {
                IconButton(onClick = onSettings, modifier = Modifier.semantics { contentDescription = "${device.name} settings" }) { Icon(Icons.Rounded.Settings, null) }
            }
        }
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item {
                Text(summary(device.card, state, device.stateError), style = MaterialTheme.typography.titleMedium)
                device.stateError?.takeIf { state != null }?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }
                entry?.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }
            }
            if (state != null) item { FullControls(model, device, state) }
        }
    }
}

@Composable
private fun Section(title: String, content: @Composable ColumnScope.() -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            content()
        }
    }
}

@Composable
private fun Reading(label: String, value: String?) {
    value ?: return
    Row(Modifier.fillMaxWidth()) {
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun Toggle(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
        Switch(checked = checked, onCheckedChange = onChange, modifier = Modifier.semantics { contentDescription = label })
    }
}

@Composable
private fun Level(label: String, value: Double, range: ClosedFloatingPointRange<Float>, unit: String = "%", onChange: (Int) -> Unit) {
    Column {
        Text("$label: ${value.roundToInt()}$unit", style = MaterialTheme.typography.bodyMedium)
        Slider(value = value.toFloat().coerceIn(range), onValueChange = { onChange(it.roundToInt()) }, valueRange = range)
    }
}

@Composable
private fun Action(icon: ImageVector, label: String, onClick: () -> Unit) {
    FilledTonalIconButton(onClick = onClick, modifier = Modifier.size(52.dp).semantics { contentDescription = label }) { Icon(icon, null) }
}

@Composable
private fun TextAction(label: String, icon: ImageVector? = null, onClick: () -> Unit) {
    FilledTonalButton(onClick = onClick, modifier = Modifier.heightIn(min = 48.dp)) {
        icon?.let { Icon(it, null, Modifier.padding(end = 6.dp)) }
        Text(label)
    }
}

private fun degrees(value: Double?): String? = value?.let { "${(it * 2).roundToInt() / 2.0}°C".replace(".0°", "°") }

@Composable
private fun FullControls(model: HouseModel, device: Device, state: JsonObject) {
    fun change(type: String, patch: JsonObject, build: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit) =
        model.pending.change(device.id, patch, Api.command(type) { putJsonObject("change", build) })

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        when (device.card) {
            "switch" -> Section("Power") {
                Toggle("On", state.flag("on") == true) { on -> model.pending.change(device.id, buildJsonObject { put("on", on) }, Api.command("switch") { put("on", on) }) }
                Reading("Drawing", state.number("power")?.let { "${it.roundToInt()} W" })
                Reading("Used", state.number("energy")?.let { "${(it * 10).roundToInt() / 10.0} kWh" })
            }
            "light" -> Section("Light") {
                val on = state.flag("on") == true
                Toggle("On", on) { next -> change("light", buildJsonObject { put("on", next) }) { put("on", next) } }
                if (on && state.supports("brightness")) {
                    Level("Brightness", state.number("brightness") ?: 100.0, 1f..100f) { value -> change("light", buildJsonObject { put("brightness", value) }) { put("brightness", value) } }
                }
                if (on && state.supports("temperature")) {
                    val minimum = (state.number("minTemperature") ?: 2000.0).toFloat()
                    val maximum = (state.number("maxTemperature") ?: 6500.0).toFloat()
                    Level("White", state.number("temperature") ?: minimum.toDouble(), minimum..maximum, " K") { value ->
                        val kelvin = (value / 100) * 100
                        change("light", buildJsonObject { put("temperature", kelvin) }) { put("temperature", kelvin) }
                    }
                }
                if (on && state.supports("color")) {
                    val color = state.child("color")
                    val hue = color?.number("hue") ?: 0.0
                    val saturation = color?.number("saturation") ?: 100.0
                    fun colour(nextHue: Int, nextSaturation: Int) {
                        val picked = buildJsonObject {
                            put("hue", nextHue)
                            put("saturation", nextSaturation)
                        }
                        change("light", buildJsonObject { put("color", picked) }) { put("color", picked) }
                    }
                    Level("Colour", hue, 0f..360f, "°") { colour(it, saturation.roundToInt()) }
                    Level("Saturation", saturation, 0f..100f) { colour(hue.roundToInt(), it) }
                }
            }
            "cover" -> Section("Position") {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    for ((action, icon, position) in listOf(Triple("open", Icons.Rounded.KeyboardArrowUp, 100), Triple("stop", Icons.Rounded.Stop, null), Triple("close", Icons.Rounded.KeyboardArrowDown, 0))) {
                        Action(icon, action.replaceFirstChar { it.uppercase() }) {
                            model.pending.change(device.id, position?.let { buildJsonObject { put("position", it) } } ?: emptyJson, Api.command("cover") { putJsonObject("move") { put("action", action) } })
                        }
                    }
                }
                state.number("position")?.let { position ->
                    Level("Open", position, 0f..100f) { value -> model.pending.change(device.id, buildJsonObject { put("position", value) }, Api.command("cover") { putJsonObject("move") { put("position", value) } }) }
                }
            }
            "climate" -> {
                Section("Heat pump") {
                    val power = state.flag("power") == true
                    Toggle("On", power) { next -> change("climate", buildJsonObject { put("power", next) }) { put("power", next) } }
                    Reading("Room", degrees(state.number("roomTemperature")))
                    state.number("targetTemperature")?.let { target ->
                        val minimum = state.number("minTemperature") ?: 10.0
                        val maximum = state.number("maxTemperature") ?: 31.0
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text("Set to", Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
                            Action(Icons.Rounded.Remove, "Colder") {
                                val next = ((target - 0.5).coerceIn(minimum, maximum) * 2).roundToInt() / 2.0
                                change("climate", buildJsonObject { put("targetTemperature", next) }) { put("targetTemperature", next) }
                            }
                            Text(degrees(target) ?: "", style = MaterialTheme.typography.titleLarge)
                            Action(Icons.Rounded.Add, "Warmer") {
                                val next = ((target + 0.5).coerceIn(minimum, maximum) * 2).roundToInt() / 2.0
                                change("climate", buildJsonObject { put("targetTemperature", next) }) { put("targetTemperature", next) }
                            }
                        }
                    }
                    val modes = (state["modes"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.content }.orEmpty()
                    if (modes.isNotEmpty()) {
                        ChipChoice(modes.map { it to it.replaceFirstChar(Char::uppercase) }, state.text("mode")) { mode -> change("climate", buildJsonObject { put("mode", mode) }) { put("mode", mode) } }
                    }
                }
                state.child("hotWater")?.let { water ->
                    Section("Hot water") {
                        Reading("Tank", degrees(water.number("temperature")))
                        Reading("Target", degrees(water.number("target")))
                        Toggle("Boost", water.flag("boost") == true) { next ->
                            change("climate", buildJsonObject { put("hotWater", water.with("boost", JsonPrimitive(next))) }) { put("hotWaterBoost", next) }
                        }
                    }
                }
            }
            "valve" -> Section("Radiator valve") {
                Reading("Room", degrees(state.number("temperature")))
                Reading("Battery", state.number("battery")?.let { "${it.roundToInt()}%" })
                state.text("heldBy")?.let { Reading("Held by", it) }
                state.number("target")?.let { target ->
                    val minimum = state.number("min") ?: 5.0
                    val maximum = state.number("max") ?: 30.0
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("Set to", Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
                        for ((icon, by) in listOf(Icons.Rounded.Remove to -0.5, Icons.Rounded.Add to 0.5)) {
                            if (by > 0) Text(degrees(target) ?: "", style = MaterialTheme.typography.titleLarge)
                            Action(icon, if (by < 0) "Colder" else "Warmer") {
                                val next = ((target + by).coerceIn(minimum, maximum) * 2).roundToInt() / 2.0
                                model.pending.change(device.id, buildJsonObject { put("target", next) }, Api.command("valve") { put("target", next) })
                            }
                        }
                    }
                }
            }
            "fan" -> Section("Fan") {
                val on = state.flag("on") == true
                Toggle("On", on) { next -> change("fan", buildJsonObject { put("on", next) }) { put("on", next) } }
                if (on) {
                    state.number("speed")?.let { speed -> Level("Speed", speed, 1f..100f) { value -> change("fan", buildJsonObject { put("speed", value) }) { put("speed", value) } } }
                    state.flag("oscillating")?.let { swing -> Toggle("Oscillate", swing) { next -> change("fan", buildJsonObject { put("oscillating", next) }) { put("oscillating", next) } } }
                }
            }
            "lock" -> Section("Lock") {
                val locked = state.flag("locked") == true
                Reading("Battery", state.number("battery")?.let { "${it.roundToInt()}%" })
                TextAction(if (locked) "Unlock" else "Lock") {
                    model.pending.change(device.id, buildJsonObject { put("locked", !locked) }, Api.command("lock") { put("locked", !locked) })
                }
            }
            "media" -> MediaControls(state) { patch, build -> change("media", patch, build) }
            "printer" -> PrinterControls(model, device, state) { patch, build -> change("printer", patch, build) }
            "vacuum" -> VacuumControls(state) { patch, build -> change("vacuum", patch, build) }
            "button" -> Section("Button") {
                TextAction("Press", Icons.Rounded.PlayArrow) { model.pending.change(device.id, emptyJson, Api.command("button")) }
            }
            "contact" -> Section("Contact") {
                Reading("Battery", state.number("battery")?.let { "${it.roundToInt()}%" })
            }
            "sensor" -> Section("Readings") {
                val rows = readings(state)
                if (rows.isEmpty()) Text("No reading yet", color = MaterialTheme.colorScheme.onSurfaceVariant)
                for ((label, value) in rows) Reading(label, value)
            }
            "meter" -> Section("Meter") {
                Reading("Drawing", state.number("power")?.let { "${it.roundToInt()} W" })
                Reading("Used", state.number("energy")?.let { "${(it * 10).roundToInt() / 10.0} kWh" })
            }
            "linky" -> Section("Meter") {
                Reading("Day", state.text("day"))
                Reading("Used", state.number("kilowattHours")?.let { "${(it * 10).roundToInt() / 10.0} kWh" })
            }
            "presence", "app" -> Section("Where") {
                Reading("Battery", state.number("battery")?.let { "${it.roundToInt()}%${if (state.flag("charging") == true) ", charging" else ""}" })
                Reading("Zone", state.text("zone"))
                Reading("Phone", state.text("platform"))
                state.child("location")?.text("at")?.let { Reading("Last seen", ago(it)) }
            }
        }
    }
}

@Composable
private fun MediaControls(state: JsonObject, change: (JsonObject, kotlinx.serialization.json.JsonObjectBuilder.() -> Unit) -> Unit) {
    Section("Player") {
        val power = state.flag("power")
        if (power != null) Toggle("On", power) { next -> change(buildJsonObject { put("power", next) }) { put("power", next) } }
        Reading("Playing", listOfNotNull(state.text("title"), state.text("artist")).joinToString(" · ").ifEmpty { null })
        if (power != false) {
            val playing = state.text("playback") == "playing"
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Action(Icons.Rounded.SkipPrevious, "Previous") { change(emptyJson) { put("action", "previous") } }
                Action(if (playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, if (playing) "Pause" else "Play") {
                    val next = if (playing) "pause" else "play"
                    change(buildJsonObject { put("playback", if (playing) "paused" else "playing") }) { put("action", next) }
                }
                Action(Icons.Rounded.SkipNext, "Next") { change(emptyJson) { put("action", "next") } }
                Action(Icons.Rounded.Stop, "Stop") { change(buildJsonObject { put("playback", "idle") }) { put("action", "stop") } }
            }
            state.number("volume")?.let { volume ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    val muted = state.flag("muted") == true
                    IconButton(onClick = { change(buildJsonObject { put("muted", !muted) }) { put("muted", !muted) } }, modifier = Modifier.semantics { contentDescription = if (muted) "Unmute" else "Mute" }) {
                        Icon(if (muted) Icons.AutoMirrored.Rounded.VolumeOff else Icons.AutoMirrored.Rounded.VolumeUp, null)
                    }
                    Slider(
                        value = volume.toFloat(),
                        onValueChange = { value -> val next = value.roundToInt(); change(buildJsonObject { put("volume", next) }) { put("volume", next) } },
                        valueRange = 0f..100f,
                        modifier = Modifier.weight(1f).semantics { contentDescription = "Volume" },
                    )
                }
            }
            val sources = (state["sources"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.content }.orEmpty()
            if (sources.isNotEmpty()) {
                Text("Source", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                ChipChoice(sources.map { it to it }, state.text("source")) { source -> change(buildJsonObject { put("source", source) }) { put("source", source) } }
            }
        }
    }
}

@Composable
private fun PrinterControls(model: HouseModel, device: Device, state: JsonObject, change: (JsonObject, kotlinx.serialization.json.JsonObjectBuilder.() -> Unit) -> Unit) {
    state.text("camera")?.let { path -> CameraPicture(model, device.id, path, "${device.name}, camera", Modifier.fillMaxWidth(), everyMillis = 5_000) }
    Section("Print") {
        val stage = state.text("stage")
        state.number("progress")?.let { progress ->
            LinearProgressIndicator(progress = { (progress / 100).toFloat() }, modifier = Modifier.fillMaxWidth())
        }
        Reading("File", state.text("fileName"))
        Reading("Time left", state.number("remainingMinutes")?.let { timeLeft(it.roundToInt()) })
        Reading("Layer", state.number("layer")?.let { layer -> "${layer.roundToInt()}${state.number("totalLayers")?.let { " of ${it.roundToInt()}" } ?: ""}" })
        Reading("Nozzle", state.child("nozzle")?.let { heater -> listOfNotNull(degrees(heater.number("temperature")), degrees(heater.number("target"))?.let { "to $it" }).joinToString(" ").ifEmpty { null } })
        Reading("Bed", state.child("bed")?.let { heater -> listOfNotNull(degrees(heater.number("temperature")), degrees(heater.number("target"))?.let { "to $it" }).joinToString(" ").ifEmpty { null } })
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (stage == "printing") TextAction("Pause", Icons.Rounded.Pause) { change(buildJsonObject { put("stage", "paused") }) { put("command", "pause") } }
            if (stage == "paused") TextAction("Resume", Icons.Rounded.PlayArrow) { change(buildJsonObject { put("stage", "printing") }) { put("command", "resume") } }
            if (stage == "printing" || stage == "paused" || stage == "preparing") {
                OutlinedButton(onClick = { change(emptyJson) { put("command", "stop") } }, modifier = Modifier.heightIn(min = 48.dp)) {
                    Icon(Icons.Rounded.Stop, null, Modifier.padding(end = 6.dp))
                    Text("Stop")
                }
            }
        }
    }
    Section("Printer") {
        state.flag("light")?.let { light -> Toggle("Light", light) { next -> change(buildJsonObject { put("light", next) }) { put("light", next) } } }
        state.number("speed")?.let { speed ->
            Text("Speed", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            ChipChoice(printerSpeeds.map { it.first.toString() to it.second }, speed.roundToInt().toString()) { picked ->
                val level = picked.toInt()
                change(buildJsonObject { put("speed", level) }) { put("speed", level) }
            }
        }
    }
}

@Composable
private fun VacuumControls(state: JsonObject, change: (JsonObject, kotlinx.serialization.json.JsonObjectBuilder.() -> Unit) -> Unit) {
    val stage = state.text("stage")
    Section("Robot") {
        Reading("Battery", state.number("battery")?.let { "${it.roundToInt()}%${if (state.flag("charging") == true) ", charging" else ""}" })
        state.text("errorText")?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (stage == "cleaning") {
                Action(Icons.Rounded.Pause, "Pause") { change(buildJsonObject { put("stage", "paused") }) { put("command", "pause") } }
            } else {
                Action(Icons.Rounded.PlayArrow, if (stage == "paused") "Resume" else "Start") { change(buildJsonObject { put("stage", "cleaning") }) { put("command", "start") } }
            }
            Action(Icons.Rounded.Stop, "Stop") { change(buildJsonObject { put("stage", "idle") }) { put("command", "stop") } }
            Action(Icons.Rounded.Home, "Send it home") { change(buildJsonObject { put("stage", "returning") }) { put("command", "dock") } }
        }
        Reading("Last clean", state.number("lastCleanMinutes")?.let { minutes -> listOfNotNull("${minutes.roundToInt()} min", state.number("lastCleanArea")?.let { "${it.roundToInt()} m²" }).joinToString(", ") })
    }
    Section("How it cleans") {
        val genius = state.text("cleanGenius")
        if (genius != null) {
            Text("CleanGenius", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            ChipChoice(vacuumCleanGenius, genius) { picked -> change(buildJsonObject { put("cleanGenius", picked) }) { put("cleanGenius", picked) } }
        }
        if (genius == null || genius == "off") {
            state.text("mode")?.let { mode ->
                Text("Mode", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                ChipChoice(vacuumModes, mode) { picked -> change(buildJsonObject { put("mode", picked) }) { put("mode", picked) } }
            }
            state.text("suction")?.let { suction ->
                Text("Suction", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                ChipChoice(vacuumSuctions, suction) { picked -> change(buildJsonObject { put("suction", picked) }) { put("suction", picked) } }
            }
            state.number("wetness")?.let { wetness ->
                Level("Water", wetness, 1f..32f, "") { value -> change(buildJsonObject { put("wetness", value) }) { put("wetness", value) } }
            }
        }
    }
    val parts = state.child("partsLeft")
    if (parts != null) {
        Section("Parts left") {
            for ((key, label) in vacuumParts) {
                val left = parts.number(key) ?: continue
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("$label: ${left.roundToInt()}%", Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                    OutlinedButton(onClick = { change(buildJsonObject { put("partsLeft", parts.with(key, JsonPrimitive(100))) }) { put("reset", key) } }, modifier = Modifier.heightIn(min = 44.dp)) {
                        Text("Reset")
                    }
                }
            }
        }
    }
    state.child("dock")?.let { dock ->
        val rows = listOf("cleanWater" to "Clean water", "dirtyWater" to "Dirty water", "dustBag" to "Dust bag", "detergent" to "Detergent")
            .mapNotNull { (key, label) -> dock.text(key)?.let { label to (dockLabels[it] ?: it) } }
        if (rows.isNotEmpty()) Section("Dock") { for ((label, value) in rows) Reading(label, value) }
    }
}
