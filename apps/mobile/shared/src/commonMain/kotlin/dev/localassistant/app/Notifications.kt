package dev.localassistant.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.background
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.DeleteSweep
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlin.time.Clock
import kotlin.time.Instant

private const val sceneActionPrefix = "scene:"

/** How long ago `iso` was, in words: "just now", "5 min ago", "3 h ago", "2 days ago". */
fun ago(iso: String, now: Instant = Clock.System.now()): String {
    val at = runCatching { Instant.parse(iso) }.getOrNull() ?: return ""
    val seconds = (now - at).inWholeSeconds
    return when {
        seconds < 45 -> "just now"
        seconds < 3_600 -> "${(seconds + 30) / 60} min ago"
        seconds < 86_400 -> "${(seconds + 1_800) / 3_600} h ago"
        else -> "${(seconds + 43_200) / 86_400} days ago".replace("1 days", "1 day")
    }
}

/** The notifications inbox, full screen: newest first, unread marked, scene buttons, remove one or all. */
@Composable
fun NotificationsScreen(model: HouseModel, onBack: () -> Unit) {
    val inbox by model.inbox.collectAsState()
    val error by model.inboxError.collectAsState()
    val progress by model.progress.collectAsState()
    LaunchedEffect(model) { model.openInbox() }
    PlatformBack(true, onBack)

    Column(Modifier.fillMaxSize()) {
        Surface(color = MaterialTheme.colorScheme.surfaceContainer) {
            Row(Modifier.fillMaxWidth().statusBarsPadding().padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack, modifier = Modifier.semantics { contentDescription = "Back to Home" }) {
                    Icon(Icons.AutoMirrored.Rounded.ArrowBack, null)
                }
                Text("Notifications", Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
                if (!inbox.isNullOrEmpty()) {
                    IconButton(
                        onClick = { model.removeNotification(null) },
                        enabled = "inbox" !in progress.busy,
                        modifier = Modifier.semantics { contentDescription = "Clear all" },
                    ) { Icon(Icons.Rounded.DeleteSweep, null) }
                }
            }
        }
        HorizontalDivider()
        val entries = inbox
        when {
            entries == null && error == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            entries.isNullOrEmpty() -> Column(
                Modifier.fillMaxSize().padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
            ) {
                Icon(Icons.Rounded.Notifications, null, Modifier.size(48.dp), tint = MaterialTheme.colorScheme.primary)
                Text(error ?: "No notifications", style = MaterialTheme.typography.titleMedium, color = if (error != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface)
                Text(
                    "What devices, routines and integrations tell you shows here for 30 days.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            else -> LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(entries, key = { it.id }) { entry -> InboxCard(model, entry, progress) }
            }
        }
    }
}

@Composable
private fun InboxCard(model: HouseModel, entry: InboxEntry, progress: Progress) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer), modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(start = 16.dp, top = 12.dp, bottom = 12.dp, end = 4.dp), verticalAlignment = Alignment.Top) {
            Box(
                Modifier.padding(top = 7.dp, end = 10.dp).size(8.dp).background(
                    if (entry.readAt == null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceContainer,
                    CircleShape,
                ),
            )
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(entry.title, style = MaterialTheme.typography.titleSmall, fontWeight = if (entry.readAt == null) FontWeight.Bold else FontWeight.Medium)
                if (entry.body.isNotBlank()) {
                    Text(entry.body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(ago(entry.createdAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                val scenes = entry.actions.filter { it.action.startsWith(sceneActionPrefix) }
                if (scenes.isNotEmpty()) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 4.dp)) {
                        for (scene in scenes) {
                            val key = "scene:${scene.action}"
                            FilledTonalButton(onClick = { model.act(key) { model.api.activate(scene.action.removePrefix(sceneActionPrefix)) } }, enabled = key !in progress.busy) {
                                Text(scene.title)
                            }
                        }
                    }
                    progress.errors.filterKeys { key -> scenes.any { "scene:${it.action}" == key } }.values.firstOrNull()?.let {
                        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            IconButton(
                onClick = { model.removeNotification(entry.id) },
                enabled = "inbox:${entry.id}" !in progress.busy,
                modifier = Modifier.semantics { contentDescription = "Remove ${entry.title}" },
            ) { Icon(Icons.Rounded.Close, null) }
        }
    }
}
