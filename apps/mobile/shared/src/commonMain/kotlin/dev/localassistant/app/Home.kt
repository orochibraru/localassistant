package dev.localassistant.app

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Air
import androidx.compose.material.icons.rounded.Blinds
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.rounded.DeviceThermostat
import androidx.compose.material.icons.rounded.DoorFront
import androidx.compose.material.icons.rounded.ElectricalServices
import androidx.compose.material.icons.rounded.Extension
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material.icons.rounded.Lightbulb
import androidx.compose.material.icons.rounded.LocalFireDepartment
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Print
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material.icons.rounded.SmartToy
import androidx.compose.material.icons.rounded.Smartphone
import androidx.compose.material.icons.rounded.Speaker
import androidx.compose.material.icons.rounded.Speed
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material.icons.rounded.TouchApp
import androidx.compose.material.icons.rounded.Tv
import androidx.compose.material.icons.rounded.Videocam
import androidx.compose.material.icons.rounded.WaterDrop
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.IconButton
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import kotlin.math.roundToInt

/** The Material icon for a plugin's icon name. */
fun iconFor(name: String): ImageVector = when (name) {
    "blinds" -> Icons.Rounded.Blinds
    "bot" -> Icons.Rounded.SmartToy
    "cctv" -> Icons.Rounded.Videocam
    "door-open" -> Icons.Rounded.DoorFront
    "fan" -> Icons.Rounded.Air
    "gauge" -> Icons.Rounded.Speed
    "heater" -> Icons.Rounded.LocalFireDepartment
    "droplets" -> Icons.Rounded.WaterDrop
    "lightbulb" -> Icons.Rounded.Lightbulb
    "lock" -> Icons.Rounded.Lock
    "mouse-pointer-click" -> Icons.Rounded.TouchApp
    "plug" -> Icons.Rounded.ElectricalServices
    "printer" -> Icons.Rounded.Print
    "smartphone" -> Icons.Rounded.Smartphone
    "speaker" -> Icons.Rounded.Speaker
    "thermometer" -> Icons.Rounded.DeviceThermostat
    "tv" -> Icons.Rounded.Tv
    "user" -> Icons.Rounded.Person
    "zap" -> Icons.Rounded.Bolt
    else -> Icons.Rounded.Extension
}

private fun patchOf(vararg pairs: Pair<String, Any?>): JsonObject = buildJsonObject {
    for ((key, value) in pairs) {
        when (value) {
            is Boolean -> put(key, value)
            is Number -> put(key, value)
            is String -> put(key, value)
            is JsonObject -> put(key, value)
        }
    }
}

/** The rooms of `house` in the order Home lists them: the whole house, then floor by floor, outside last. */
fun sections(house: House): List<Pair<String, List<Device>>> {
    val levels = house.floors.associate { it.id to it.level }
    val rooms = house.rooms.sortedWith(compareBy({ it.outdoor }, { levels[it.floorId] ?: 0 }, { it.name }))
    val byRoom = house.devices.groupBy { device -> device.roomId?.takeIf { id -> house.rooms.any { it.id == id } } }
    return buildList {
        byRoom[null]?.let { add("Whole house" to it) }
        for (room in rooms) byRoom[room.id]?.let { add(room.name to it) }
    }
}

/** Home: who's in, the scenes, and every device by room. */
@Composable
fun HomeScreen(model: HouseModel, onOpenInbox: () -> Unit) {
    Refreshable(model) { HomeGrid(model, onOpenInbox) }
}

@Composable
private fun HomeGrid(model: HouseModel, onOpenInbox: () -> Unit) {
    val house by model.house.collectAsState()
    val error by model.loadError.collectAsState()
    val progress by model.progress.collectAsState()
    model.pending.entries.collectAsState().value
    val current = house
    LazyVerticalGrid(
        GridCells.Adaptive(164.dp),
        Modifier.fillMaxSize().statusBarsPadding(),
        contentPadding = PaddingValues(16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        full {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(current?.home?.name ?: "Home", Modifier.weight(1f), style = MaterialTheme.typography.headlineMedium)
                    val unread = current?.unreadNotifications ?: 0
                    IconButton(
                        onClick = onOpenInbox,
                        modifier = Modifier.semantics { contentDescription = if (unread > 0) "Notifications, $unread unread" else "Notifications" },
                    ) {
                        BadgedBox(badge = { if (unread > 0) Badge { Text(if (unread > 99) "99+" else unread.toString()) } }) {
                            Icon(Icons.Rounded.Notifications, null)
                        }
                    }
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }
                if (current == null && error == null) CircularProgressIndicator(Modifier.padding(top = 24.dp))
            }
        }
        if (current == null) return@LazyVerticalGrid
        val people = current.people.filter { it.tracked }
        if (people.isNotEmpty()) {
            full {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(people, key = { it.id }) { person ->
                        AssistChip(
                            onClick = {},
                            label = { Text("${person.name} · ${when (person.home) { true -> "home"; false -> "away"; null -> "unknown" }}") },
                            leadingIcon = { Icon(Icons.Rounded.Person, null, Modifier.size(18.dp)) },
                        )
                    }
                }
            }
        }
        if (current.scenes.isNotEmpty()) {
            full {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(current.scenes, key = { it.id }) { scene ->
                        val key = "scene:${scene.id}"
                        AssistChip(
                            onClick = { model.act(key) { model.api.activate(scene.id) } },
                            label = { Text(scene.name) },
                            leadingIcon = { if (key in progress.busy) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp) },
                        )
                    }
                }
            }
            progress.errors.filterKeys { it.startsWith("scene:") }.values.firstOrNull()?.let { message ->
                full { Text(message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            }
        }
        for ((title, devices) in sections(current)) {
            full { Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
            items(devices, key = { it.id }) { device -> DeviceCard(model, device) }
        }
    }
}

private fun LazyGridScope.full(content: @Composable () -> Unit) = item(span = { GridItemSpan(maxLineSpan) }) { content() }

/** A device's card: tap to toggle what toggles, with the controls its kind has. */
@Composable
fun DeviceCard(model: HouseModel, device: Device) {
    val entry = model.pending.entries.collectAsState().value[device.id]
    val state = model.pending.stateOf(device)
    val on = active(device.card, state)
    val toggle = toggleFor(device.card, state)
    Card(
        colors = CardDefaults.cardColors(
            containerColor = if (on) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceContainer,
            contentColor = if (on) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface,
        ),
        modifier = Modifier.fillMaxWidth().semantics { contentDescription = "${device.name}, ${summary(device.card, state, device.stateError)}" },
    ) {
        Column(
            Modifier
                .then(if (toggle != null) Modifier.clickable { model.pending.change(device.id, toggle.first, toggle.second) } else Modifier)
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(iconFor(device.icon), null, Modifier.size(22.dp), tint = if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.weight(1f))
                if (entry?.sending == true) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
            }
            Text(device.name, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                summary(device.card, state, device.stateError),
                style = MaterialTheme.typography.bodySmall,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Controls(model, device, state)
            entry?.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        }
    }
}

/** The state patch and command a tap on a `card` device's card sends, or null when tapping does nothing. */
fun toggleFor(card: String, state: JsonObject?): Pair<JsonObject, JsonObject>? {
    val current = state ?: return null
    return when (card) {
        "switch" -> (!(current.flag("on") ?: false)).let { patchOf("on" to it) to Api.command("switch") { put("on", it) } }
        "light", "fan" -> (!(current.flag("on") ?: false)).let { next -> patchOf("on" to next) to Api.command(card) { putJsonObject("change") { put("on", next) } } }
        "lock" -> (!(current.flag("locked") ?: false)).let { patchOf("locked" to it) to Api.command("lock") { put("locked", it) } }
        "climate" -> (!(current.flag("power") ?: false)).let { next -> patchOf("power" to next) to Api.command("climate") { putJsonObject("change") { put("power", next) } } }
        "media" -> (current.flag("power") == false).let { next -> patchOf("power" to next) to Api.command("media") { putJsonObject("change") { put("power", next) } } }
        "button" -> JsonObject(emptyMap()) to Api.command("button")
        else -> null
    }
}

@Composable
private fun Step(icon: ImageVector, label: String, onClick: () -> Unit) {
    FilledTonalIconButton(onClick = onClick, modifier = Modifier.size(44.dp).semantics { contentDescription = label }, shape = CircleShape) {
        Icon(icon, null)
    }
}

private fun stepped(value: Double, by: Double, minimum: Double, maximum: Double): Double = (((value + by) * 2).roundToInt() / 2.0).coerceIn(minimum, maximum)

@Composable
private fun Controls(model: HouseModel, device: Device, state: JsonObject?) {
    state ?: return
    when (device.card) {
        "cover" -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for ((action, icon, position) in listOf(Triple("open", Icons.Rounded.KeyboardArrowUp, 100), Triple("stop", Icons.Rounded.Stop, null), Triple("close", Icons.Rounded.KeyboardArrowDown, 0))) {
                Step(icon, action.replaceFirstChar { it.uppercase() }) {
                    model.pending.change(
                        device.id,
                        position?.let { patchOf("position" to it) } ?: JsonObject(emptyMap()),
                        Api.command("cover") { putJsonObject("move") { put("action", action) } },
                    )
                }
            }
        }
        "climate", "valve" -> {
            val key = if (device.card == "climate") "targetTemperature" else "target"
            val target = state.number(key) ?: return
            val minimum = state.number(if (device.card == "climate") "minTemperature" else "min") ?: 5.0
            val maximum = state.number(if (device.card == "climate") "maxTemperature" else "max") ?: 30.0
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for ((icon, by) in listOf(Icons.Rounded.Remove to -0.5, Icons.Rounded.Add to 0.5)) {
                    Step(icon, if (by < 0) "Colder" else "Warmer") {
                        val next = stepped(target, by, minimum, maximum)
                        val command = if (device.card == "climate") {
                            Api.command("climate") { putJsonObject("change") { put("targetTemperature", next) } }
                        } else {
                            Api.command("valve") { put("target", next) }
                        }
                        model.pending.change(device.id, patchOf(key to next), command)
                    }
                }
            }
        }
        "light" -> if (state.flag("on") == true && state.supports("brightness")) {
            Slider(
                value = (state.number("brightness") ?: 100.0).toFloat(),
                onValueChange = { value ->
                    val next = value.roundToInt().coerceIn(1, 100)
                    model.pending.change(device.id, patchOf("brightness" to next), Api.command("light") { putJsonObject("change") { put("brightness", next) } })
                },
                valueRange = 1f..100f,
            )
        }
        else -> Unit
    }
}
