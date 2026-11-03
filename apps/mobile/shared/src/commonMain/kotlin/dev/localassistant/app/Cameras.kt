package dev.localassistant.app

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Videocam
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

/** A picture a camera serves at `path`, read again every `everyMillis` while it shows; black until the first one lands. */
@Composable
fun CameraPicture(model: HouseModel, deviceId: String, path: String, description: String, modifier: Modifier = Modifier, everyMillis: Long = 10_000) {
    var picture by remember(deviceId, path) { mutableStateOf<ImageBitmap?>(null) }
    LaunchedEffect(deviceId, path, everyMillis) {
        while (true) {
            runCatching { model.api.media(deviceId, path) }.getOrNull()?.let(::decodeImage)?.let { picture = it }
            delay(everyMillis)
        }
    }
    Box(modifier.clip(RoundedCornerShape(12.dp)).background(Color.Black).aspectRatio(16f / 9f), contentAlignment = Alignment.Center) {
        picture?.let { Image(it, description, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) }
            ?: Icon(Icons.Rounded.Videocam, null, tint = Color.White.copy(alpha = 0.4f))
    }
}

/** What a camera's card says under its name: offline, live, recording, or what it watches. */
fun cameraStatus(state: kotlinx.serialization.json.JsonObject?, error: String?): String {
    if (error != null) return error
    state ?: return "No reading yet"
    state.text("source")?.let { return it }
    if (state.flag("streaming") != true) return "Offline"
    return if (state.flag("recording") == true) "Live, recording" else "Live"
}

/** A camera full screen: live, or a recording being played, with every recording the plugin lists below. */
@Composable
fun CameraScreen(model: HouseModel, device: Device, onBack: () -> Unit, onSettings: (() -> Unit)? = null) {
    var view by remember(device.id) { mutableStateOf<CameraView?>(null) }
    var error by remember(device.id) { mutableStateOf<String?>(null) }
    var playing by remember(device.id) { mutableStateOf<CameraClip?>(null) }
    PlatformBack(true) { if (playing != null) playing = null else onBack() }
    LaunchedEffect(device.id) {
        runCatching { model.api.camera(device.id) }
            .onSuccess { view = it; error = null }
            .onFailure { error = it.message }
    }

    Column(Modifier.fillMaxSize()) {
        ScreenBar(device.name, onBack) {
            if (onSettings != null) {
                IconButton(onClick = onSettings, modifier = Modifier.semantics { contentDescription = "${device.name} settings" }) { Icon(Icons.Rounded.Settings, null) }
            }
        }
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                val current = view
                val clip = playing
                val video = clip?.video
                when {
                    video != null -> Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        VideoPlayer(model.api.mediaUrl(device.id, video), model.api.authorization, Modifier.fillMaxWidth().aspectRatio(16f / 9f))
                        TextButton(onClick = { playing = null }, modifier = Modifier.heightIn(min = 44.dp)) { Text("Back to live") }
                    }
                    current?.live?.format == "hls" -> VideoPlayer(
                        model.api.mediaUrl(device.id, current.live.path),
                        model.api.authorization,
                        Modifier.fillMaxWidth().aspectRatio(16f / 9f),
                    )
                    current?.live != null -> CameraPicture(model, device.id, current.live.path, "${device.name}, live", Modifier.fillMaxWidth(), everyMillis = 2_000)
                    current?.snapshot != null -> CameraPicture(model, device.id, current.snapshot, "${device.name}, latest picture", Modifier.fillMaxWidth())
                    current != null -> Text(cameraStatus(device.state, device.stateError), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    error == null -> Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }
            }
            val current = view ?: return@LazyColumn
            item { Text(current.clips.title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
            current.clipsError?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) } }
            if (current.clipsError == null && current.clips.clips.isEmpty()) {
                item { Text(current.clips.empty, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            items(current.clips.clips.sortedByDescending { it.startedAt }, key = { it.id }) { clip ->
                ClipRow(model, device, clip, clip.id == playing?.id) { playing = clip }
            }
        }
    }
}

@Composable
private fun ClipRow(model: HouseModel, device: Device, clip: CameraClip, current: Boolean, onPlay: () -> Unit) {
    val label = listOf(clip.label.replaceFirstChar { it.uppercase() }, ago(clip.startedAt)).filter { it.isNotBlank() }.joinToString(", ")
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (current) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceContainer)
            .then(if (clip.video != null) Modifier.clickable(onClick = onPlay) else Modifier)
            .padding(8.dp)
            .semantics { contentDescription = if (clip.video != null) "Play $label" else label },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        val image = clip.image
        if (image != null) {
            CameraPicture(model, device.id, image, "", Modifier.width(112.dp), everyMillis = Long.MAX_VALUE)
        } else {
            Icon(Icons.Rounded.PlayArrow, null, Modifier.size(24.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            clip.detail?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2) }
        }
    }
}
