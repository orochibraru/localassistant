package dev.localassistant.app

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import org.unifiedpush.android.connector.FailedReason
import org.unifiedpush.android.connector.PushService
import org.unifiedpush.android.connector.UnifiedPush
import org.unifiedpush.android.connector.data.PushEndpoint
import org.unifiedpush.android.connector.data.PushMessage
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume

private const val CHANNEL = "notices"
private const val CHECKS = "notice-checks"
private const val ENDPOINT = "push-endpoint"

private fun schedulePeriodic(context: Context) {
    val request = PeriodicWorkRequestBuilder<NoticeWorker>(15, TimeUnit.MINUTES)
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
        .build()
    WorkManager.getInstance(context).enqueueUniquePeriodicWork(CHECKS, ExistingPeriodicWorkPolicy.KEEP, request)
}

/** Shows `title` and `body` as one of the phone's own notifications; tapping it opens the app. */
internal fun postNotice(context: Context, id: Int, title: String, body: String) {
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    manager.createNotificationChannel(NotificationChannel(CHANNEL, "Notifications", NotificationManager.IMPORTANCE_DEFAULT))
    val open = context.packageManager.getLaunchIntentForPackage(context.packageName)
    val tap = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_IMMUTABLE)
    val icon = context.resources.getIdentifier("ic_notify", "drawable", context.packageName)
    val notification = Notification.Builder(context, CHANNEL)
        .setSmallIcon(icon.takeIf { it != 0 } ?: context.applicationInfo.icon)
        .setContentTitle(title)
        .setContentText(body)
        .setStyle(Notification.BigTextStyle().bigText(body))
        .setContentIntent(tap)
        .setAutoCancel(true)
        .build()
    manager.notify(id, notification)
}

actual object Notices {
    actual suspend fun enable(on: Boolean, api: Api): NoticeMode {
        val context = AndroidHost.context
        if (!on) {
            WorkManager.getInstance(context).cancelUniqueWork(CHECKS)
            UnifiedPush.unregister(context)
            Prefs.get(ENDPOINT)?.let { endpoint -> runCatching { api.unregisterPush(endpoint) } }
            Prefs.set(ENDPOINT, null)
            return NoticeMode.Off
        }
        if (Build.VERSION.SDK_INT >= 33 &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            AndroidHost.activity.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
        freshNotices(api)
        val distributor = withContext(Dispatchers.Main) {
            suspendCancellableCoroutine { done ->
                UnifiedPush.tryUseCurrentOrDefaultDistributor(AndroidHost.activity) { found -> done.resume(found) }
            }
        }
        if (distributor) {
            UnifiedPush.register(context, messageForDistributor = "LocalAssistant", vapid = api.pushKey())
            WorkManager.getInstance(context).cancelUniqueWork(CHECKS)
            return NoticeMode.Instant
        }
        schedulePeriodic(context)
        return NoticeMode.Periodic
    }
}

/** Checks the inbox in the background and shows what's new, when no UnifiedPush app delivers it at once. */
class NoticeWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        AndroidHost.context = applicationContext
        val fresh = try {
            freshNotices()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            return Result.retry()
        }
        fresh.forEach { postNotice(applicationContext, it.id.toInt(), it.title, it.body) }
        return Result.success()
    }
}

/** Receives what the server pushes through the phone's UnifiedPush app, and tells the server where to push. */
class LocalPushService : PushService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()
        AndroidHost.context = applicationContext
    }

    override fun onNewEndpoint(endpoint: PushEndpoint, instance: String) {
        val keys = endpoint.pubKeySet ?: return
        val session = Store.session() ?: return
        scope.launch {
            runCatching { Api(session).registerPush(endpoint.url, keys.pubKey, keys.auth, deviceName) }
                .onSuccess { Prefs.set(ENDPOINT, endpoint.url) }
        }
    }

    override fun onMessage(message: PushMessage, instance: String) {
        if (!message.decrypted) return
        val payload = runCatching { json.decodeFromString<PushPayload>(message.content.decodeToString()) }.getOrNull() ?: return
        postNotice(applicationContext, (System.currentTimeMillis() % Int.MAX_VALUE).toInt(), payload.title, payload.body)
    }

    override fun onRegistrationFailed(reason: FailedReason, instance: String) {
        schedulePeriodic(applicationContext)
        saveNoticeMode(NoticeMode.Periodic)
    }

    override fun onUnregistered(instance: String) {
        Prefs.get(ENDPOINT)?.let { endpoint ->
            Store.session()?.let { session -> scope.launch { runCatching { Api(session).unregisterPush(endpoint) } } }
        }
        Prefs.set(ENDPOINT, null)
    }
}
