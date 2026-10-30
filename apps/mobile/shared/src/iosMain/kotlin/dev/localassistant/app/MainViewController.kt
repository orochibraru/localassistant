package dev.localassistant.app

import androidx.compose.ui.window.ComposeUIViewController

@Suppress("ktlint:standard:function-naming")
fun MainViewController() = ComposeUIViewController { App() }

/** A `localassistant://` link the system handed the app: a scanned pairing code. */
fun openLink(url: String) {
    Auth.callbacks.value = url
}
