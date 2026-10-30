package dev.localassistant.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
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
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

/** The account, this phone in the house and its location, and signing out. */
@Composable
fun SettingsScreen(model: HouseModel) {
    val house by model.house.collectAsState()
    val progress by model.progress.collectAsState()
    val scope = rememberCoroutineScope()
    var phone by remember { mutableStateOf(Store.phoneId()) }
    var share by remember { mutableStateOf(Store.sharesLocation()) }
    var name by remember(house?.user?.name) { mutableStateOf("${house?.user?.name ?: "My"}'s $deviceName") }
    var locationError by remember { mutableStateOf<String?>(null) }
    val askLocation = rememberLocationAccess { granted ->
        share = granted
        Store.saveSharesLocation(granted)
        locationError = if (granted) null else "Location is off for LocalAssistant. Allow it in the phone's settings."
        if (granted) scope.launch { model.report() }
    }
    LaunchedEffect(progress) { phone = Store.phoneId() }

    Column(Modifier.fillMaxSize().statusBarsPadding().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("Settings", style = MaterialTheme.typography.headlineMedium)
        Section("Account") {
            Text(house?.user?.name ?: "…", style = MaterialTheme.typography.titleMedium)
            Text(house?.user?.email ?: "", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(model.api.session.server.substringAfter("://"), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
        }
        Section("This phone in the house") {
            if (phone == null) {
                Text("Add it to show its battery and, if you share it, whether you're home.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedTextField(name, { name = it.take(60) }, Modifier.fillMaxWidth(), label = { Text("Name") }, singleLine = true)
                Button(onClick = { model.addPhone(name.trim()) }, enabled = name.isNotBlank() && "phone" !in progress.busy, modifier = Modifier.fillMaxWidth().height(48.dp)) { Text("Add to the house") }
                progress.errors["phone"]?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Share the location", style = MaterialTheme.typography.titleSmall)
                        Text("Sent every five minutes while the app is open, for who's home.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                    }
                    Switch(checked = share, onCheckedChange = { next ->
                        if (next) {
                            askLocation()
                        } else {
                            share = false
                            Store.saveSharesLocation(false)
                        }
                    })
                }
                locationError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                OutlinedButton(onClick = { scope.launch { model.report() } }, modifier = Modifier.fillMaxWidth().height(48.dp)) { Text("Send now") }
            }
        }
        OutlinedButton(onClick = model::signOut, modifier = Modifier.fillMaxWidth().height(48.dp)) {
            Icon(Icons.AutoMirrored.Rounded.Logout, null)
            Text("Sign out", Modifier.padding(start = 8.dp))
        }
        Text("LocalAssistant $appVersion", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            content()
        }
    }
}
