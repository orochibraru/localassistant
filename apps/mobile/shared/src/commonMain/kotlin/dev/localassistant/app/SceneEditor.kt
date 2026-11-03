package dev.localassistant.app

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.math.roundToInt

private const val SAVING = "scene-edit"

/** Makes a scene, or changes `editing`: its name, each device it sets and how, and deleting it. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SceneEditor(model: HouseModel, editing: Scene?, onDone: () -> Unit) {
    val house by model.house.collectAsState()
    val progress by model.progress.collectAsState()
    var name by remember(editing?.id) { mutableStateOf(editing?.name ?: "") }
    var members by remember(editing?.id) { mutableStateOf(editing?.members ?: emptyList()) }
    var adding by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    val devices = house?.devices.orEmpty()
    val byId = devices.associateBy { it.id }
    val addable = devices.filter { device -> startingCommand(device.card) != null && members.none { it.deviceId == device.id } }
    val busy = SAVING in progress.busy
    PlatformBack(true, onDone)

    Column(Modifier.fillMaxSize().imePadding()) {
        ScreenBar(if (editing == null) "New scene" else "Edit ${editing.name}", onDone) {
            if (editing != null) {
                IconButton(onClick = { deleting = true }, enabled = !busy, modifier = Modifier.semantics { contentDescription = "Delete ${editing.name}" }) {
                    Icon(Icons.Rounded.Delete, null)
                }
            }
        }
        LazyColumn(
            Modifier.weight(1f),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), label = { Text("Name") }, placeholder = { Text("Movie night") }, singleLine = true)
            }
            item { Text("Sets", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 4.dp)) }
            if (members.isEmpty()) {
                item { Text("Add the devices it sets: each starts the way it is now.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            itemsIndexed(members, key = { _, member -> member.deviceId }) { index, member ->
                val deviceName = byId[member.deviceId]?.name ?: "A removed device"
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer)) {
                    Column(Modifier.padding(start = 16.dp, end = 4.dp, top = 4.dp, bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(deviceName, style = MaterialTheme.typography.titleSmall)
                                Text(describeCommand(member.command, deviceName), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            IconButton(onClick = { members = members.filterIndexed { at, _ -> at != index } }, modifier = Modifier.semantics { contentDescription = "Take $deviceName out" }) {
                                Icon(Icons.Rounded.Close, null)
                            }
                        }
                        Column(Modifier.padding(end = 12.dp)) {
                            CommandEditor(member.command) { next -> members = members.mapIndexed { at, entry -> if (at == index) entry.copy(command = next) else entry } }
                        }
                    }
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (addable.isNotEmpty()) {
                        OutlinedButton(onClick = { adding = true }, modifier = Modifier.heightIn(min = 48.dp)) {
                            Icon(Icons.Rounded.Add, null)
                            Text("Add a device", Modifier.padding(start = 8.dp))
                        }
                    }
                    if (members.isNotEmpty()) {
                        OutlinedButton(
                            onClick = { members = members.map { member -> member.copy(command = captureCommand(byId[member.deviceId]?.state) ?: member.command) } },
                            modifier = Modifier.heightIn(min = 48.dp),
                        ) {
                            Icon(Icons.Rounded.CameraAlt, null)
                            Text("How they are now", Modifier.padding(start = 8.dp))
                        }
                    }
                }
            }
            progress.errors[SAVING]?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) } }
        }
        Button(
            onClick = { model.saveScene(editing?.id, SceneDefinition(name.trim(), members), onDone) },
            enabled = !busy && name.isNotBlank() && members.isNotEmpty(),
            modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp).heightIn(min = 52.dp),
        ) {
            if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) else Text("Save")
        }
    }

    if (adding) {
        ModalBottomSheet(onDismissRequest = { adding = false }) {
            LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
                item { Text("Add a device", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp)) }
                itemsIndexed(addable, key = { _, device -> device.id }) { _, device ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = 56.dp)
                            .clickable {
                                memberCommand(device)?.let { members = members + SceneMember(device.id, it) }
                                adding = false
                            }
                            .padding(horizontal = 24.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        Icon(iconFor(device.icon), null)
                        Text(device.name, style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }
        }
    }

    if (deleting && editing != null) {
        AlertDialog(
            onDismissRequest = { deleting = false },
            title = { Text("Delete ${editing.name}?") },
            text = { Text("Routines that set it report it as gone from then on.") },
            confirmButton = {
                TextButton(onClick = {
                    deleting = false
                    model.deleteScene(editing.id, onDone)
                }) { Text("Delete", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { deleting = false }) { Text("Cancel") } },
        )
    }
}

/** The controls for one scene member's command, as the web's command editor has them; `onChange` gets the new command. */
@Composable
fun CommandEditor(command: JsonObject, onChange: (JsonObject) -> Unit) {
    val change = command.child("change") ?: emptyJson
    val type = command.text("type") ?: return
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        when (type) {
            "switch" -> Choices(onOffOptions, if (command.flag("on") == true) "on" else "off") { onChange(command.with("on", JsonPrimitive(it == "on"))) }
            "lock" -> Choices(listOf("lock" to "Lock", "unlock" to "Unlock"), if (command.flag("locked") == true) "lock" else "unlock") {
                onChange(command.with("locked", JsonPrimitive(it == "lock")))
            }
            "light", "fan" -> {
                val on = change.flag("on") != false
                Choices(onOffOptions, if (on) "on" else "off") { next ->
                    onChange(if (next == "on") command.withChange("on", JsonPrimitive(true)) else command.with("change", buildJsonObject { put("on", false) }))
                }
                if (on) {
                    val key = if (type == "light") "brightness" else "speed"
                    OptionalPercent(if (type == "light") "Brightness" else "Speed", change.number(key), 1.0) { onChange(command.withChange(key, it?.let(::jsonNumber))) }
                }
            }
            "cover" -> {
                val move = command.child("move") ?: emptyJson
                val position = move.number("position")
                Choices(
                    listOf("open" to "Open", "close" to "Close", "position" to "To a position"),
                    if (position != null) "position" else move.text("action") ?: "close",
                ) { next ->
                    onChange(command.with("move", buildJsonObject { if (next == "position") put("position", 50) else put("action", next) }))
                }
                if (position != null) {
                    Percent("Open", position, 0.0) { onChange(command.with("move", buildJsonObject { put("position", it.roundToInt()) })) }
                }
            }
            "climate" -> {
                val power = change.flag("power") != false
                Choices(onOffOptions, if (power) "on" else "off") { next ->
                    onChange(if (next == "on") command.withChange("power", JsonPrimitive(true)) else command.with("change", buildJsonObject { put("power", false) }))
                }
                if (power) {
                    Choices(listOf("keep" to "Keep mode") + climateModes.map { it to it.replaceFirstChar(Char::uppercase) }, change.text("mode") ?: "keep") { next ->
                        onChange(command.withChange("mode", if (next == "keep") null else JsonPrimitive(next)))
                    }
                    Stepper("Temperature", change.number("targetTemperature") ?: 20.0, 5.0, 35.0) { onChange(command.withChange("targetTemperature", jsonNumber(it))) }
                }
            }
            "valve" -> Stepper("Temperature", command.number("target") ?: 19.0, 4.0, 35.0) { onChange(command.with("target", jsonNumber(it))) }
            "media" -> {
                val choice = change.text("action") ?: if (change.flag("power") == false) "off" else "on"
                Choices(listOf("on" to "Turn on", "off" to "Turn off", "play" to "Play", "pause" to "Pause", "next" to "Next"), choice) { next ->
                    onChange(
                        command.with(
                            "change",
                            buildJsonObject {
                                if (next == "on" || next == "off") {
                                    put("power", next == "on")
                                    change.number("volume")?.let { put("volume", it.roundToInt()) }
                                } else {
                                    put("action", next)
                                }
                            },
                        ),
                    )
                }
                if (choice == "on") OptionalPercent("Volume", change.number("volume"), 0.0) { onChange(command.withChange("volume", it?.let(::jsonNumber))) }
            }
            "printer", "vacuum" -> {
                val orders = if (type == "printer") printerCommands else vacuumCommands
                Choices(orders.map { it to it.replaceFirstChar(Char::uppercase) }, change.text("command") ?: orders.first()) {
                    onChange(command.with("change", buildJsonObject { put("command", it) }))
                }
            }
            "button" -> Text("Presses it.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private val onOffOptions = listOf("on" to "On", "off" to "Off")

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Choices(options: List<Pair<String, String>>, selected: String, onPick: (String) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        for ((value, label) in options) {
            FilterChip(selected = value == selected, onClick = { if (value != selected) onPick(value) }, label = { Text(label) })
        }
    }
}

@Composable
private fun Percent(label: String, value: Double, minimum: Double, onChange: (Double) -> Unit) {
    Column {
        Text("$label: ${value.roundToInt()}%", style = MaterialTheme.typography.bodyMedium)
        Slider(value = value.toFloat(), onValueChange = { onChange(it.roundToInt().toDouble()) }, valueRange = minimum.toFloat()..100f)
    }
}

@Composable
private fun OptionalPercent(label: String, value: Double?, minimum: Double, onChange: (Double?) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(if (value == null) "$label: leave as it is" else "Set the ${label.lowercase()}", Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Switch(checked = value != null, onCheckedChange = { onChange(if (it) 50.0 else null) }, modifier = Modifier.semantics { contentDescription = "Set the ${label.lowercase()}" })
    }
    value?.let { Percent(label, it, minimum) { next -> onChange(next) } }
}

@Composable
private fun Stepper(label: String, value: Double, minimum: Double, maximum: Double, onChange: (Double) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        FilledTonalIconButton(onClick = { onChange((value - 0.5).coerceIn(minimum, maximum)) }, modifier = Modifier.size(44.dp).semantics { contentDescription = "Colder" }) {
            Icon(Icons.Rounded.Remove, null)
        }
        Text("${if (value % 1.0 == 0.0) value.toLong().toString() else value.toString()}°C", style = MaterialTheme.typography.titleMedium)
        FilledTonalIconButton(onClick = { onChange((value + 0.5).coerceIn(minimum, maximum)) }, modifier = Modifier.size(44.dp).semantics { contentDescription = "Warmer" }) {
            Icon(Icons.Rounded.Add, null)
        }
    }
}
