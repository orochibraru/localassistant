package dev.localassistant.app

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.ArrowUpward
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.EditNote
import androidx.compose.material3.AssistChip
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

private val suggestions = listOf("What's on right now?", "Close every blind downstairs", "Is anyone home?", "Turn everything off in the living room")

/** The assistant, full screen: the conversation, inline thinking and failures, and the composer. */
@Composable
fun AssistantScreen(model: HouseModel, onBack: () -> Unit) {
    val turns by model.turns.collectAsState()
    val thinking by model.thinking.collectAsState()
    val error by model.chatError.collectAsState()
    var draft by remember { mutableStateOf("") }
    val list = rememberLazyListState()
    LaunchedEffect(turns.size, thinking, error) {
        val last = turns.size + (if (thinking || error != null) 1 else 0)
        if (last > 0) list.animateScrollToItem(last - 1)
    }
    fun send(text: String = draft.trim()) {
        if (text.isEmpty() || thinking) return
        draft = ""
        model.ask(text)
    }

    Column(Modifier.fillMaxSize().imePadding()) {
        Surface(color = MaterialTheme.colorScheme.surfaceContainer) {
            Row(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 4.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack, modifier = Modifier.semantics { contentDescription = "Back to Home" }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, null) }
                Text("Assistant", Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
                if (turns.isNotEmpty()) {
                    IconButton(onClick = model::clearChat, enabled = !thinking, modifier = Modifier.semantics { contentDescription = "New conversation" }) { Icon(Icons.Rounded.EditNote, null) }
                }
            }
        }
        HorizontalDivider()
        Box(Modifier.weight(1f).fillMaxWidth()) {
            if (turns.isEmpty() && !thinking) {
                Column(Modifier.align(Alignment.Center).padding(24.dp).widthIn(max = 420.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Icon(Icons.Rounded.AutoAwesome, null, Modifier.size(48.dp), tint = MaterialTheme.colorScheme.primary)
                    Text("Ask about the house or tell it what to do.", style = MaterialTheme.typography.bodyLarge)
                    for (suggestion in suggestions) {
                        AssistChip(onClick = { send(suggestion) }, label = { Text(suggestion) }, modifier = Modifier.fillMaxWidth())
                    }
                }
            }
            LazyColumn(state = list, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxSize()) {
                itemsIndexed(turns) { _, (turn, actions) ->
                    if (turn.role == "user") UserBubble(turn.text) else AssistantBubble(turn.text, actions)
                }
                if (thinking) item { Thinking() }
                error?.let { message ->
                    item {
                        Surface(color = MaterialTheme.colorScheme.errorContainer, shape = RoundedCornerShape(16.dp)) {
                            Row(Modifier.padding(start = 16.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(message, Modifier.weight(1f), color = MaterialTheme.colorScheme.onErrorContainer, style = MaterialTheme.typography.bodyMedium)
                                TextButton(onClick = { model.ask() }) { Text("Retry") }
                            }
                        }
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(12.dp), verticalAlignment = Alignment.Bottom) {
            Surface(shape = RoundedCornerShape(28.dp), color = MaterialTheme.colorScheme.surfaceContainer, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                Row(Modifier.padding(6.dp), verticalAlignment = Alignment.Bottom) {
                    TextField(
                        draft,
                        { draft = it.take(4000) },
                        Modifier.weight(1f),
                        placeholder = { Text("Message the assistant") },
                        maxLines = 6,
                        colors = TextFieldDefaults.colors(
                            focusedContainerColor = Color.Transparent,
                            unfocusedContainerColor = Color.Transparent,
                            focusedIndicatorColor = Color.Transparent,
                            unfocusedIndicatorColor = Color.Transparent,
                        ),
                    )
                    FilledIconButton(onClick = { send() }, enabled = draft.isNotBlank() && !thinking, modifier = Modifier.size(48.dp).semantics { contentDescription = "Send" }) {
                        Icon(Icons.Rounded.ArrowUpward, null)
                    }
                }
            }
        }
    }
}

@Composable
private fun UserBubble(text: String) {
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
        Surface(color = MaterialTheme.colorScheme.primary, shape = RoundedCornerShape(24.dp, 24.dp, 6.dp, 24.dp), modifier = Modifier.widthIn(max = 320.dp)) {
            Text(text, Modifier.padding(horizontal = 16.dp, vertical = 10.dp), color = MaterialTheme.colorScheme.onPrimary, style = MaterialTheme.typography.bodyLarge)
        }
    }
}

@Composable
private fun Avatar() {
    Box(Modifier.size(28.dp).background(MaterialTheme.colorScheme.primaryContainer, CircleShape), contentAlignment = Alignment.Center) {
        Icon(Icons.Rounded.AutoAwesome, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary)
    }
}

@Composable
private fun AssistantBubble(text: String, actions: List<String>) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Avatar()
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Surface(
                color = MaterialTheme.colorScheme.surfaceContainer,
                shape = RoundedCornerShape(6.dp, 24.dp, 24.dp, 24.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            ) {
                Markdown(text, Modifier.padding(horizontal = 16.dp, vertical = 10.dp))
            }
            for (action in actions) {
                Text("✓ $action", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun Thinking() {
    val transition = rememberInfiniteTransition()
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically, modifier = Modifier.semantics { contentDescription = "Thinking" }) {
        Avatar()
        for (index in 0..2) {
            val lift by transition.animateFloat(0f, -5f, infiniteRepeatable(tween(400, delayMillis = index * 150), RepeatMode.Reverse))
            Box(Modifier.offset(y = lift.dp).size(7.dp).background(MaterialTheme.colorScheme.onSurfaceVariant, CircleShape))
        }
    }
}
