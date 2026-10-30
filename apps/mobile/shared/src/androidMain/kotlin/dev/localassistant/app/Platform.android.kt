package dev.localassistant.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.BatteryManager
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.core.content.ContextCompat
import androidx.core.net.toUri
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import java.security.MessageDigest

/** The activity and application context the platform calls need, set by `MainActivity`. */
object AndroidHost {
    lateinit var activity: Activity
    lateinit var context: Context
}

actual fun sha256(bytes: ByteArray): ByteArray = MessageDigest.getInstance("SHA-256").digest(bytes)

actual val deviceName: String get() = Build.MODEL

actual val platformName: String get() = "Android ${Build.VERSION.RELEASE}"

actual fun openAuthBrowser(url: String) {
    CustomTabsIntent.Builder().build().launchUrl(AndroidHost.activity, url.toUri())
}

actual object Prefs {
    private val prefs get() = AndroidHost.context.getSharedPreferences("localassistant", Context.MODE_PRIVATE)

    actual fun get(key: String): String? = prefs.getString(key, null)

    actual fun set(key: String, value: String?) {
        prefs.edit().apply { if (value == null) remove(key) else putString(key, value) }.apply()
    }
}

@Composable
actual fun PlatformBack(enabled: Boolean, onBack: () -> Unit) = BackHandler(enabled, onBack)

actual fun canScanCodes(): Boolean = AndroidHost.context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)

@Composable
actual fun rememberCodeScanner(onCode: (String) -> Unit): () -> Unit {
    val read by rememberUpdatedState(onCode)
    return {
        val options = GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build()
        GmsBarcodeScanning.getClient(AndroidHost.activity, options).startScan()
            .addOnSuccessListener { code -> code.rawValue?.let { read(it) } }
    }
}

actual fun battery(): Battery {
    val manager = AndroidHost.context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager ?: return Battery(null, null)
    val level = manager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY).takeIf { it in 0..100 }
    return Battery(level, manager.isCharging)
}

private fun granted(): Boolean = listOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
    .any { ContextCompat.checkSelfPermission(AndroidHost.context, it) == PackageManager.PERMISSION_GRANTED }

@Composable
actual fun rememberLocationAccess(onResult: (Boolean) -> Unit): () -> Unit {
    val answer by rememberUpdatedState(onResult)
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { results ->
        answer(results.values.any { it })
    }
    return {
        if (granted()) {
            answer(true)
        } else {
            launcher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
        }
    }
}

@SuppressLint("MissingPermission")
actual suspend fun currentPosition(): Position? {
    if (!granted()) return null
    val manager = AndroidHost.context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
    val latest = manager.getProviders(true)
        .mapNotNull { runCatching { manager.getLastKnownLocation(it) }.getOrNull() }
        .maxByOrNull { it.time } ?: return null
    return Position(latest.latitude, latest.longitude, latest.accuracy.toDouble().takeIf { latest.hasAccuracy() })
}

actual val appVersion: String
    get() = runCatching {
        AndroidHost.context.packageManager.getPackageInfo(AndroidHost.context.packageName, 0).versionName
    }.getOrNull() ?: "?"
