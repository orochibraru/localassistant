package dev.localassistant.app

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.LinkOff
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp

private const val SETTINGS = "device-settings"
private const val REMOVING = "device-remove"
private const val CONNECTING = "setup-connect"
private const val FINDING = "setup-find"
private const val DISCONNECTING = "setup-disconnect"
private const val ADDING = "setup-add"

/** The integration a device of `kind` comes from: its own id, or one its kind's id starts with. */
fun setupFor(setups: List<PluginSetup>, kind: String): PluginSetup? = setups.firstOrNull { kind == it.id || kind.startsWith("${it.id}-") }

/** How many devices a connect or a search found, in words. */
fun foundText(found: Int?): String = when (found) {
    null -> "Asked. New devices show up within a few seconds."
    1 -> "Found 1 new device."
    else -> "Found $found new devices."
}

private data class LoadedSetups(val setups: Setups?, val error: String?, val reload: () -> Unit)

@Composable
private fun rememberSetups(model: HouseModel): LoadedSetups {
    var setups by remember { mutableStateOf<Setups?>(null) }
    var version by remember { mutableIntStateOf(0) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(version) {
        runCatching { model.api.setups() }
            .onSuccess {
                setups = it
                error = null
            }
            .onFailure {
                error = it.message
                if (setups == null) setups = Setups()
            }
    }
    return LoadedSetups(setups, error) { version += 1 }
}

@Composable
private fun Busy(busy: Boolean, label: String, icon: ImageVector, enabled: Boolean = true, onClick: () -> Unit) {
    Button(onClick = onClick, enabled = enabled && !busy, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) {
        if (busy) {
            CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
        } else {
            Icon(icon, null, Modifier.padding(end = 8.dp))
            Text(label)
        }
    }
}

@Composable
private fun ErrorLine(message: String?) {
    message?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }
}

/** A device's settings, for an admin: its name, room, owner and integration fields, and removing it. */
@Composable
fun DeviceSettingsScreen(model: HouseModel, device: Device, onBack: () -> Unit, onManage: (String) -> Unit, onRemoved: () -> Unit) {
    val house by model.house.collectAsState()
    val progress by model.progress.collectAsState()
    val (setups, loadError) = rememberSetups(model)
    val setup = setups?.setups?.let { setupFor(it, device.kind) }
    val pluginFields = setup?.device?.fields.orEmpty()
    var name by remember(device.id) { mutableStateOf(device.name) }
    var room by remember(device.id) { mutableStateOf(device.roomId ?: "house") }
    var owner by remember(device.id) { mutableStateOf(device.ownerId ?: "nobody") }
    var values by remember(device.id, pluginFields) { mutableStateOf(initialValues(pluginFields, device.fields)) }
    var removing by remember { mutableStateOf(false) }
    val errors = progress.fields[SETTINGS].orEmpty()
    val owned = device.kind == "app" || device.card == "presence"
    PlatformBack(true, onBack)

    Column(Modifier.fillMaxSize().imePadding()) {
        ScreenBar("${device.name} settings", onBack)
        if (setups == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@Column
        }
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            loadError?.let { message -> item { ErrorLine(message) } }
            item { FormText(name, { name = it }, "Name", errors["name"]?.firstOrNull()) }
            item { Picker("Room", roomOptions(house), room, errors["roomId"]?.firstOrNull()) { room = it } }
            if (owned) {
                item {
                    Picker("Whose is it", listOf("nobody" to "Nobody") + setups.people.map { it.id to it.name }, owner, errors["ownerId"]?.firstOrNull()) { owner = it }
                }
            }
            if (pluginFields.isNotEmpty()) {
                item {
                    PluginFields(pluginFields, values, pluginFields.filter(::isSecret).map { it.name }, errors) { key, value -> values = values + (key to value) }
                }
            }
            item {
                ErrorLine(progress.errors[SETTINGS])
                Busy(SETTINGS in progress.busy, "Save", Icons.Rounded.Check, enabled = name.isNotBlank()) {
                    val form = buildMap {
                        put("name", name.trim())
                        put("roomId", room)
                        if (owned) put("ownerId", owner)
                        putAll(values.filterValues { it.isNotEmpty() })
                    }
                    model.act(SETTINGS) {
                        model.api.editDevice(device.id, form)
                        onBack()
                    }
                }
            }
            if (setup?.connection != null) {
                item {
                    OutlinedButton(onClick = { onManage(setup.id) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                        Icon(Icons.Rounded.Settings, null, Modifier.padding(end = 8.dp))
                        Text("Manage ${setup.name}")
                    }
                }
            }
            item { HorizontalDivider(Modifier.padding(vertical = 8.dp)) }
            item {
                ErrorLine(progress.errors[REMOVING])
                TextButton(onClick = { removing = true }, modifier = Modifier.heightIn(min = 48.dp)) {
                    Icon(Icons.Rounded.Delete, null, Modifier.padding(end = 8.dp), tint = MaterialTheme.colorScheme.error)
                    Text("Remove this device", color = MaterialTheme.colorScheme.error)
                }
            }
        }
    }

    if (removing) {
        AlertDialog(
            onDismissRequest = { removing = false },
            title = { Text("Remove ${device.name}?") },
            text = {
                Text(
                    when {
                        device.kind == "app" -> "Add it again from the app's settings, on it."
                        setup?.device != null -> "Its keys are deleted. Add it again to control it."
                        else -> "Finding new devices brings it back."
                    },
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    removing = false
                    model.act(REMOVING) {
                        model.api.removeDevice(device.id)
                        onRemoved()
                    }
                }) { Text("Remove", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { removing = false }) { Text("Keep it") } },
        )
    }
}

/** Every integration an admin can add devices with; picking one opens its setup. */
@Composable
fun AddDeviceScreen(model: HouseModel, onBack: () -> Unit, onPick: (String) -> Unit) {
    val (setups, loadError) = rememberSetups(model)
    PlatformBack(true, onBack)
    Column(Modifier.fillMaxSize()) {
        ScreenBar("Add a device", onBack)
        val list = setups?.setups
        if (list == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@Column
        }
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(vertical = 8.dp)) {
            item {
                Text("Pick what to connect. Each one walks you through what it needs.", Modifier.padding(horizontal = 16.dp, vertical = 8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            loadError?.let { message -> item { Box(Modifier.padding(horizontal = 16.dp)) { ErrorLine(message) } } }
            if (list.isEmpty() && loadError == null) item { Text("No integration is turned on: an admin adds them on the web, in Admin, Plugins.", Modifier.padding(16.dp)) }
            items(list, key = { it.id }) { setup ->
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 64.dp).clickable { onPick(setup.id) }.padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    Icon(iconFor(setup.icon), null)
                    Column(Modifier.weight(1f)) {
                        Text(setup.name, style = MaterialTheme.typography.titleSmall)
                        Text(setup.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (setup.connected) Text("Connected", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                }
            }
        }
    }
}

/** One integration's setup: its connection (connect, search, change, disconnect) and its add-a-device form. */
@Composable
fun SetupScreen(model: HouseModel, pluginId: String, onBack: () -> Unit, onAdded: () -> Unit) {
    val house by model.house.collectAsState()
    val progress by model.progress.collectAsState()
    val (setups, loadError, reload) = rememberSetups(model)
    val setup = setups?.setups?.firstOrNull { it.id == pluginId }
    var changing by remember { mutableStateOf(false) }
    var disconnecting by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<String?>(null) }
    var connection by remember(setup?.id, setup?.connected) { mutableStateOf(setup?.connection?.let { initialValues(it.fields, setup.values) }.orEmpty()) }
    var name by remember { mutableStateOf("") }
    var room by remember { mutableStateOf("house") }
    var fields by remember(setup?.id) { mutableStateOf(setup?.device?.let { initialValues(it.fields, null) }.orEmpty()) }
    PlatformBack(true, onBack)

    Column(Modifier.fillMaxSize().imePadding()) {
        ScreenBar(setup?.name ?: "Add a device", onBack)
        if (setup == null) {
            Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                if (setups == null) CircularProgressIndicator() else Text(loadError ?: "That integration is off or gone.")
            }
            return@Column
        }
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            val needsBroker = "mqtt" in setup.needs && !setups.broker
            if (needsBroker) {
                item { Text("This needs the household's MQTT broker. Connect it once on the web, in Devices: other integrations share it.") }
                return@LazyColumn
            }
            notice?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.primary) } }
            val link = setup.connection
            if (link != null) {
                if (setup.connected && !changing) {
                    item { Text(link.connected, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    link.find?.let { find ->
                        item {
                            ErrorLine(progress.errors[FINDING])
                            Busy(FINDING in progress.busy, find, Icons.Rounded.Refresh) {
                                model.act(FINDING) { notice = foundText(model.api.discover(setup.id)) }
                            }
                        }
                    }
                    item {
                        OutlinedButton(onClick = { changing = true }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                            Icon(Icons.Rounded.Settings, null, Modifier.padding(end = 8.dp))
                            Text("Change the settings")
                        }
                    }
                    item {
                        ErrorLine(progress.errors[DISCONNECTING])
                        TextButton(onClick = { disconnecting = true }, modifier = Modifier.heightIn(min = 48.dp)) {
                            Icon(Icons.Rounded.LinkOff, null, Modifier.padding(end = 8.dp), tint = MaterialTheme.colorScheme.error)
                            Text("Disconnect", color = MaterialTheme.colorScheme.error)
                        }
                    }
                } else {
                    item { Text(link.description, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    item {
                        PluginFields(link.fields, connection, setup.secretsSet, progress.fields[CONNECTING].orEmpty()) { key, value -> connection = connection + (key to value) }
                    }
                    item {
                        ErrorLine(progress.errors[CONNECTING])
                        Busy(CONNECTING in progress.busy, if (setup.connected) "Save" else "Connect", Icons.Rounded.Check) {
                            val form = connection.filterValues { it.isNotEmpty() }
                            model.act(CONNECTING) {
                                notice = "Connected. ${foundText(model.api.connect(setup.id, form))}"
                                changing = false
                                reload()
                            }
                        }
                    }
                }
            }
            val form = setup.device
            if (form != null) {
                item { HorizontalDivider(Modifier.padding(vertical = 4.dp)) }
                item {
                    Text(form.title, style = MaterialTheme.typography.titleMedium)
                    Text(form.description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                val errors = progress.fields[ADDING].orEmpty()
                item { FormText(name, { name = it }, "Name", errors["name"]?.firstOrNull()) }
                item { Picker("Room", roomOptions(house), room, errors["roomId"]?.firstOrNull()) { room = it } }
                item { PluginFields(form.fields, fields, emptyList(), errors) { key, value -> fields = fields + (key to value) } }
                item {
                    ErrorLine(progress.errors[ADDING])
                    Busy(ADDING in progress.busy, form.submit, Icons.Rounded.Add, enabled = name.isNotBlank()) {
                        val body = buildMap {
                            put("name", name.trim())
                            put("roomId", room)
                            putAll(fields.filterValues { it.isNotEmpty() })
                        }
                        model.act(ADDING) {
                            model.api.addDevice(setup.id, body)
                            onAdded()
                        }
                    }
                }
            }
            if (link == null && form == null) {
                setup.automatic?.let { item { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) } }
            }
        }
    }

    if (disconnecting && setup != null) {
        AlertDialog(
            onDismissRequest = { disconnecting = false },
            title = { Text("Disconnect ${setup.name}?") },
            text = { Text("Its devices are removed from the house.") },
            confirmButton = {
                TextButton(onClick = {
                    disconnecting = false
                    model.act(DISCONNECTING) {
                        model.api.disconnect(setup.id)
                        notice = "${setup.name} disconnected."
                        reload()
                    }
                }) { Text("Disconnect", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { disconnecting = false }) { Text("Cancel") } },
        )
    }
}
