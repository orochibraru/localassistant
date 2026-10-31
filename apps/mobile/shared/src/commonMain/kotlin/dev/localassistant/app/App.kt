package dev.localassistant.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** The whole app: sign-in until there's a session, the house after. */
@Composable
fun App() {
    LocalAssistantTheme {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            var session by remember { mutableStateOf(Store.session()) }
            val current = session
            if (current == null) {
                SignInScreen { Store.saveSession(it); session = it }
            } else {
                MainScreen(current) { Store.saveSession(null); session = null }
            }
        }
    }
}

/** Asks for the server, then signs in through its approval page or a scanned pairing code. */
@Composable
fun SignInScreen(onSignedIn: (Session) -> Unit) {
    val scope = rememberCoroutineScope()
    var server by remember { mutableStateOf(Prefs.get("last-server") ?: "") }
    var working by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var pairing by remember { mutableStateOf<Pairing?>(null) }
    val callback by Auth.callbacks.collectAsState()
    val scan = rememberCodeScanner { code ->
        pairing = Auth.pairing(code)
        if (pairing == null) error = "That isn't a LocalAssistant pairing code."
    }

    fun signIn(work: suspend () -> Session) {
        working = true
        error = null
        scope.launch {
            runCatching { work() }.onSuccess(onSignedIn).onFailure { error = it.message }
            working = false
        }
    }

    LaunchedEffect(callback) {
        val link = callback ?: return@LaunchedEffect
        Auth.callbacks.value = null
        when {
            link.startsWith(Auth.REDIRECT) -> signIn { Auth.complete(link) }
            Auth.pairing(link) != null -> pairing = Auth.pairing(link)
        }
    }

    Box(Modifier.fillMaxSize().safeDrawingPadding().padding(24.dp), contentAlignment = Alignment.Center) {
        Column(Modifier.widthIn(max = 420.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Icon(Icons.Rounded.Home, null, Modifier.size(56.dp).align(Alignment.CenterHorizontally), tint = MaterialTheme.colorScheme.primary)
            Text("LocalAssistant", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
            Text(
                "Type your server's address, or scan the pairing code from Account, This device in a signed-in browser.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                server,
                { server = it },
                Modifier.fillMaxWidth(),
                label = { Text("Server address") },
                placeholder = { Text("home.example.com") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Go),
            )
            Button(
                onClick = {
                    Prefs.set("last-server", server.trim())
                    error = null
                    Auth.start(server)
                },
                enabled = server.isNotBlank() && !working,
                modifier = Modifier.fillMaxWidth().height(52.dp),
            ) {
                if (working) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) else Text("Sign in")
            }
            if (canScanCodes()) {
                OutlinedButton(onClick = scan, enabled = !working, modifier = Modifier.fillMaxWidth().height(52.dp)) {
                    Icon(Icons.Rounded.QrCodeScanner, null)
                    Text("Scan a pairing code", Modifier.padding(start = 8.dp))
                }
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }
        }
    }

    pairing?.let { found ->
        AlertDialog(
            onDismissRequest = { pairing = null },
            title = { Text("Sign in to ${found.host}?") },
            text = { Text("Only if you just made this code yourself, in your own browser.") },
            confirmButton = {
                TextButton(onClick = {
                    pairing = null
                    signIn { Auth.pair(found) }
                }) { Text("Sign in") }
            },
            dismissButton = { TextButton(onClick = { pairing = null }) { Text("Cancel") } },
        )
    }
}

private enum class Tab(val label: String, val icon: ImageVector) {
    Home("Home", Icons.Rounded.Home),
    Routines("Routines", Icons.Rounded.Schedule),
    Assistant("Assistant", Icons.Rounded.AutoAwesome),
    Settings("Settings", Icons.Rounded.Settings),
}

/** The signed-in app: Home, routines and scenes, the assistant full screen, and settings. */
@Composable
fun MainScreen(session: Session, onSignedOut: () -> Unit) {
    val scope = rememberCoroutineScope()
    val model = remember(session) { HouseModel(Api(session), scope, onSignedOut) }
    var tab by remember { mutableStateOf(Tab.Home) }
    var inboxOpen by remember { mutableStateOf(false) }
    val house by model.house.collectAsState()

    LaunchedEffect(model) {
        while (true) {
            model.refresh()
            delay(15_000)
        }
    }
    LaunchedEffect(model) {
        while (true) {
            model.report()
            delay(5 * 60_000)
        }
    }
    LaunchedEffect(Unit) { Auth.callbacks.value = null }
    PlatformBack(tab != Tab.Home) { tab = Tab.Home }

    if (inboxOpen) {
        NotificationsScreen(model, onBack = { inboxOpen = false })
        return
    }
    if (tab == Tab.Assistant) {
        AssistantScreen(model, onBack = { tab = Tab.Home })
        return
    }
    Scaffold(
        bottomBar = {
            NavigationBar {
                for (entry in Tab.entries) {
                    if (entry == Tab.Assistant && house?.assistant != true) continue
                    NavigationBarItem(
                        selected = tab == entry,
                        onClick = { tab = entry },
                        icon = { Icon(entry.icon, null) },
                        label = { Text(entry.label) },
                    )
                }
            }
        },
    ) { padding ->
        Box(Modifier.padding(padding)) {
            when (tab) {
                Tab.Home -> HomeScreen(model, onOpenInbox = { inboxOpen = true })
                Tab.Routines -> RoutinesScreen(model)
                Tab.Settings -> SettingsScreen(model)
                Tab.Assistant -> Unit
            }
        }
    }
}
