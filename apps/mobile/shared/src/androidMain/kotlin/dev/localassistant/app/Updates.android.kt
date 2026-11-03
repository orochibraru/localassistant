package dev.localassistant.app

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageInstaller
import android.os.Build
import androidx.core.content.IntentCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private val sideloaders = setOf("com.google.android.packageinstaller", "com.android.packageinstaller")

actual fun installedFromGitHub(): Boolean {
    val context = AndroidHost.context
    if (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) return false
    val installer = runCatching {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            context.packageManager.getInstallSourceInfo(context.packageName).installingPackageName
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getInstallerPackageName(context.packageName)
        }
    }.getOrNull()
    return installer == null || installer in sideloaders || installer == context.packageName
}

actual suspend fun installPackage(apk: ByteArray) {
    val context = AndroidHost.context
    withContext(Dispatchers.IO) {
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply { setAppPackageName(context.packageName) }
        val id = installer.createSession(params)
        installer.openSession(id).use { session ->
            session.openWrite("localassistant.apk", 0, apk.size.toLong()).use { stream ->
                stream.write(apk)
                session.fsync(stream)
            }
            val intent = Intent(context, UpdateReceiver::class.java).setPackage(context.packageName)
            val pending = PendingIntent.getBroadcast(context, id, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE)
            session.commit(pending.intentSender)
        }
    }
}

/** Hears back from the system's installer: shows its confirmation when it asks, and reports a failure to [Updater]. */
class UpdateReceiver : BroadcastReceiver() {
    /** Opens the installer's confirmation, or records how the install ended. */
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                val confirm = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_INTENT, Intent::class.java) ?: return
                context.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
            PackageInstaller.STATUS_SUCCESS -> Updater.progress.value = UpdateProgress.Idle
            else -> Updater.progress.value = UpdateProgress.Failed(
                intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)?.takeIf { it.isNotBlank() } ?: "The update wasn't installed.",
            )
        }
    }
}
