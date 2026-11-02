package dev.localassistant.app

import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import platform.BackgroundTasks.BGAppRefreshTask
import platform.BackgroundTasks.BGAppRefreshTaskRequest
import platform.BackgroundTasks.BGTaskScheduler
import platform.Foundation.NSDate
import platform.Foundation.dateWithTimeIntervalSinceNow
import platform.UserNotifications.UNAuthorizationOptionAlert
import platform.UserNotifications.UNAuthorizationOptionBadge
import platform.UserNotifications.UNAuthorizationOptionSound
import platform.UserNotifications.UNMutableNotificationContent
import platform.UserNotifications.UNNotificationRequest
import platform.UserNotifications.UNUserNotificationCenter
import kotlin.coroutines.resume

private const val REFRESH = "dev.localassistant.notices"

@OptIn(ExperimentalForeignApi::class)
private fun scheduleRefresh() {
    val request = BGAppRefreshTaskRequest(REFRESH)
    request.earliestBeginDate = NSDate.dateWithTimeIntervalSinceNow(15.0 * 60)
    BGTaskScheduler.sharedScheduler.submitTaskRequest(request, null)
}

private fun post(entry: InboxEntry) {
    val content = UNMutableNotificationContent()
    content.setTitle(entry.title)
    content.setBody(entry.body)
    UNUserNotificationCenter.currentNotificationCenter().addNotificationRequest(
        UNNotificationRequest.requestWithIdentifier("notice-${entry.id}", content, null),
        null,
    )
}

actual object Notices {
    actual suspend fun enable(on: Boolean, api: Api): NoticeMode {
        if (!on) {
            BGTaskScheduler.sharedScheduler.cancelTaskRequestWithIdentifier(REFRESH)
            return NoticeMode.Off
        }
        val granted = suspendCancellableCoroutine { done ->
            UNUserNotificationCenter.currentNotificationCenter().requestAuthorizationWithOptions(
                UNAuthorizationOptionAlert or UNAuthorizationOptionSound or UNAuthorizationOptionBadge,
            ) { allowed, _ -> done.resume(allowed) }
        }
        if (!granted) throw Failure("Notifications are off for LocalAssistant. Allow them in the iPhone's Settings.")
        freshNotices(api)
        scheduleRefresh()
        return NoticeMode.Periodic
    }
}

/** Registers the background check that shows new notifications; iOS refuses one registered after launch has finished. */
internal fun registerBackgroundChecks() {
    BGTaskScheduler.sharedScheduler.registerForTaskWithIdentifier(REFRESH, null) { task ->
        val refresh = task as? BGAppRefreshTask ?: return@registerForTaskWithIdentifier
        scheduleRefresh()
        val job = MainScope().launch {
            val fresh = try {
                freshNotices()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                emptyList()
            }
            fresh.forEach(::post)
            refresh.setTaskCompletedWithSuccess(true)
        }
        refresh.expirationHandler = {
            job.cancel()
            refresh.setTaskCompletedWithSuccess(false)
        }
    }
    if (noticeMode() != NoticeMode.Off) scheduleRefresh()
}
