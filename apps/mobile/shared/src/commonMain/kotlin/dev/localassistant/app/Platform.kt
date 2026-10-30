package dev.localassistant.app

import androidx.compose.runtime.Composable

/** SHA-256 of `bytes`, for the PKCE challenge. */
expect fun sha256(bytes: ByteArray): ByteArray

/** The phone's model, shown on the server's approval page and its sessions. */
expect val deviceName: String

/** The operating system and its version, as the phone reports it. */
expect val platformName: String

/** Opens the server's approval page in the system's browser sheet; its answer lands in [Auth.callbacks]. */
expect fun openAuthBrowser(url: String)

/** The app's small private key-value store. */
expect object Prefs {
    /** The value stored under `key`, or null. */
    fun get(key: String): String?

    /** Stores `value` under `key`; null removes it. */
    fun set(key: String, value: String?)
}

/** Runs `onBack` on the system's back gesture while `enabled`. */
@Composable
expect fun PlatformBack(enabled: Boolean, onBack: () -> Unit)

/** Whether the phone can read a QR code itself. */
expect fun canScanCodes(): Boolean

/** The system's QR scanner; returns what opens it, and a cancel reads nothing. */
@Composable
expect fun rememberCodeScanner(onCode: (String) -> Unit): () -> Unit

/** The battery level from 0 to 100 and whether it charges, each null when the phone won't say. */
data class Battery(val level: Int?, val charging: Boolean?)

/** Reads the battery. */
expect fun battery(): Battery

/** A position and its accuracy in metres. */
data class Position(val latitude: Double, val longitude: Double, val accuracy: Double?)

/** Asks for the location permission; returns what asks, and `onResult` says whether it was granted. */
@Composable
expect fun rememberLocationAccess(onResult: (Boolean) -> Unit): () -> Unit

/** The phone's latest position, or null without permission or a fix. */
expect suspend fun currentPosition(): Position?

/** The app's own version. */
expect val appVersion: String
