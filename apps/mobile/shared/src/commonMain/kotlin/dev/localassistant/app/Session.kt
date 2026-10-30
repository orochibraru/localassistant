package dev.localassistant.app

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlin.uuid.Uuid

@Serializable
data class Session(val server: String, val token: String)

/** What the app keeps between launches: the session, and this phone's place in the house. */
object Store {
    private const val SESSION = "session"
    private const val INSTALLATION = "installation"
    private const val PHONE = "phone"
    private const val SHARE_LOCATION = "share-location"

    /** The saved session, or null when signed out. */
    fun session(): Session? = Prefs.get(SESSION)?.let { runCatching { Json.decodeFromString<Session>(it) }.getOrNull() }

    /** Saves `session`, or forgets it and the phone's registration with null. */
    fun saveSession(session: Session?) {
        Prefs.set(SESSION, session?.let { Json.encodeToString(it) })
        if (session == null) {
            Prefs.set(PHONE, null)
        }
    }

    /** A random id for this install, made once, that names the phone to the server. */
    fun installationId(): String = Prefs.get(INSTALLATION) ?: Uuid.random().toString().also { Prefs.set(INSTALLATION, it) }

    /** The device id the server gave this phone, or null before it's added to the house. */
    fun phoneId(): String? = Prefs.get(PHONE)

    /** Remembers the device id the server gave this phone. */
    fun savePhoneId(id: String?) = Prefs.set(PHONE, id)

    /** Whether the person chose to share this phone's location. */
    fun sharesLocation(): Boolean = Prefs.get(SHARE_LOCATION) == "true"

    /** Remembers whether to share this phone's location. */
    fun saveSharesLocation(share: Boolean) = Prefs.set(SHARE_LOCATION, share.toString())
}
