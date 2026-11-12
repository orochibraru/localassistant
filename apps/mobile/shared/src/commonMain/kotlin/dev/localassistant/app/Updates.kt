package dev.localassistant.app

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.plugins.onDownload
import io.ktor.client.statement.HttpResponse
import io.ktor.http.isSuccess
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

private const val RELEASES = "https://api.github.com/repos/zedensix/localassistant/releases/latest"

@Serializable
private data class ReleaseAsset(val name: String, @SerialName("browser_download_url") val url: String)

@Serializable
private data class Release(@SerialName("tag_name") val tag: String, val body: String? = null, val assets: List<ReleaseAsset> = emptyList())

/** A newer build of the app on GitHub: its version, the APK to download and its release notes. */
data class AppUpdate(val version: String, val url: String, val notes: String)

/** What the updater is doing: nothing, downloading with how far it got, handing over to the system, or why it failed. */
sealed interface UpdateProgress {
    /** Nothing in flight. */
    data object Idle : UpdateProgress

    /** Downloading, `fraction` from 0 to 1, or null when the size is unknown. */
    data class Downloading(val fraction: Float?) : UpdateProgress

    /** The system's installer has the APK and asks the person. */
    data object Installing : UpdateProgress

    /** It failed, with why. */
    data class Failed(val message: String) : UpdateProgress
}

/** The numbers of a version like `1.0.3` or `v1.0.3`, for comparing; anything after them is ignored. */
fun versionParts(version: String): List<Int> = version.trim().removePrefix("v").split('.', '-', '+').map { part -> part.takeWhile(Char::isDigit) }.takeWhile { it.isNotEmpty() }.map(String::toInt)

/** Whether `candidate` is a later version than `current`. */
fun isNewer(candidate: String, current: String): Boolean {
    val next = versionParts(candidate)
    val now = versionParts(current)
    for (index in 0 until maxOf(next.size, now.size)) {
        val difference = next.getOrElse(index) { 0 } - now.getOrElse(index) { 0 }
        if (difference != 0) return difference > 0
    }
    return false
}

/** Updates the app from its GitHub releases, when it was installed from one. */
object Updater {
    val available = MutableStateFlow<AppUpdate?>(null)
    val progress = MutableStateFlow<UpdateProgress>(UpdateProgress.Idle)

    /** Looks for a newer release than this build; quiet when the app didn't come from GitHub or GitHub can't be reached. */
    suspend fun check(client: HttpClient = httpClient()) {
        if (!installedFromGitHub()) return
        val release = runCatching {
            val response: HttpResponse = client.get(RELEASES) { header("Accept", "application/vnd.github+json") }
            if (response.status.isSuccess()) response.body<Release>() else null
        }.getOrNull() ?: return
        val version = release.tag.removePrefix("v")
        val apk = release.assets.firstOrNull { it.name.endsWith(".apk") } ?: return
        available.value = if (isNewer(version, appVersion)) AppUpdate(version, apk.url, release.body.orEmpty()) else null
    }

    /** Downloads `update` and hands it to the system's installer, which asks the person to confirm. */
    suspend fun install(update: AppUpdate, client: HttpClient = httpClient()) {
        progress.value = UpdateProgress.Downloading(null)
        runCatching {
            val response = client.get(update.url) {
                onDownload { read, total -> progress.value = UpdateProgress.Downloading(total?.takeIf { it > 0 }?.let { (read.toFloat() / it).coerceIn(0f, 1f) }) }
            }
            if (!response.status.isSuccess()) throw Failure("GitHub answered ${response.status.value}. Try again.")
            val apk: ByteArray = response.body()
            progress.value = UpdateProgress.Installing
            installPackage(apk)
        }.onFailure { progress.value = UpdateProgress.Failed(it.message ?: "The download didn't finish.") }
    }
}
