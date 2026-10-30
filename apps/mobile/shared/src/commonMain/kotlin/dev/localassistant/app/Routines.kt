package dev.localassistant.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

/** Scenes to set and routines to run or turn off. */
@Composable
fun RoutinesScreen(model: HouseModel) {
    Refreshable(model) { RoutineList(model) }
}

@Composable
private fun RoutineList(model: HouseModel) {
    val house by model.house.collectAsState()
    val routines by model.routines.collectAsState()
    val progress by model.progress.collectAsState()
    LazyColumn(
        Modifier.fillMaxSize().statusBarsPadding(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item { Text("Scenes", style = MaterialTheme.typography.headlineSmall) }
        val scenes = house?.scenes.orEmpty()
        if (scenes.isEmpty()) item { Text("No scenes yet: an admin makes them on the web.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        items(scenes, key = { "scene:${it.id}" }) { scene ->
            val key = "scene:${scene.id}"
            Line(scene.name, progress.errors[key]) {
                FilledTonalButton(onClick = { model.act(key) { model.api.activate(scene.id) } }, enabled = key !in progress.busy) {
                    if (key in progress.busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Text("Set")
                }
            }
        }
        item { Text("Routines", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 16.dp)) }
        if (routines.isEmpty()) item { Text("No routines yet: make them on the web.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        items(routines, key = { "routine:${it.id}" }) { routine ->
            val key = "routine:${routine.id}"
            Line(routine.name, progress.errors[key]) {
                IconButton(
                    onClick = { model.act(key) { model.api.run(routine.id) } },
                    enabled = key !in progress.busy,
                    modifier = Modifier.semantics { contentDescription = "Run ${routine.name} now" },
                ) {
                    if (key in progress.busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Icon(Icons.Rounded.PlayArrow, null)
                }
                Switch(
                    checked = routine.enabled,
                    onCheckedChange = { next -> model.act(key) { model.api.enable(routine.id, next) } },
                    modifier = Modifier.semantics { contentDescription = "${routine.name} on" },
                )
            }
        }
    }
}

@Composable
private fun Line(title: String, error: String?, actions: @Composable () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(title, Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
                actions()
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        }
    }
}
