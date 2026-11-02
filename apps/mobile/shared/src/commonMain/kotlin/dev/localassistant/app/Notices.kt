package dev.localassistant.app

/** How this phone hears about new notifications. */
enum class NoticeMode(val label: String) {
    Off("Off"),
    Instant("Instant, through your UnifiedPush app"),
    Periodic("Checked every 15 minutes or so"),
}

/** The phone's own notifications for what lands in the inbox while the app is closed. */
expect object Notices {
    /** Turns them on, instant when the platform can, or off; returns how they now arrive. */
    suspend fun enable(on: Boolean, api: Api): NoticeMode
}

private const val LAST_SEEN = "last-notice"
private const val MODE = "notice-mode"

/** How notifications were last set to arrive on this phone. */
fun noticeMode(): NoticeMode = runCatching { NoticeMode.valueOf(Prefs.get(MODE) ?: "") }.getOrDefault(NoticeMode.Off)

/** Remembers how notifications arrive on this phone. */
fun saveNoticeMode(mode: NoticeMode) = Prefs.set(MODE, mode.name)

/** Marks every notification up to `entries`' newest as seen, so none of them shows on the phone later. */
fun markNoticesSeen(entries: List<InboxEntry>) {
    val newest = entries.maxOfOrNull { it.id } ?: return
    if (newest > (Prefs.get(LAST_SEEN)?.toLongOrNull() ?: 0)) Prefs.set(LAST_SEEN, newest.toString())
}

/** The unread notifications that arrived since the phone last showed or saw one, oldest first; none when signed out. */
suspend fun freshNotices(api: Api? = Store.session()?.let { Api(it) }): List<InboxEntry> {
    val client = api ?: return emptyList()
    val last = Prefs.get(LAST_SEEN)?.toLongOrNull()
    val inbox = client.notifications().notifications
    markNoticesSeen(inbox)
    if (last == null) return emptyList()
    return inbox.filter { it.readAt == null && it.id > last }.sortedBy { it.id }
}
