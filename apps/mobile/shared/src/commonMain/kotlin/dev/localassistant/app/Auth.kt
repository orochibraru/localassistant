package dev.localassistant.app

import io.ktor.client.HttpClient
import io.ktor.http.URLBuilder
import io.ktor.http.Url
import kotlinx.coroutines.flow.MutableStateFlow
import kotlin.io.encoding.Base64
import kotlin.uuid.Uuid

private val base64url = Base64.UrlSafe.withPadding(Base64.PaddingOption.ABSENT)

/** The S256 challenge for a PKCE `verifier`. */
fun pkceChallenge(verifier: String): String = base64url.encode(sha256(verifier.encodeToByteArray()))

/** A server and the single-use code from its pairing QR code. */
data class Pairing(val server: String, val code: String) {
    val host get() = server.substringAfter("://")
}

/** Signing in: an authorization code grant with PKCE through the browser sheet, or a pairing code. */
object Auth {
    const val REDIRECT = "localassistant://auth"

    private class Pending(val server: String, val verifier: String)

    private val pending = mutableMapOf<String, Pending>()

    val callbacks = MutableStateFlow<String?>(null)

    /** The server's address from what a person typed: trimmed, HTTPS unless they named a scheme. */
    fun address(typed: String): String = typed.trim().trimEnd('/').let { if ("://" in it) it else "https://$it" }

    /** Records a new attempt and returns the approval page to open. */
    fun begin(server: String, device: String): String {
        val base = address(server)
        val verifier = Uuid.random().toHexString() + Uuid.random().toHexString()
        val state = Uuid.random().toHexString()
        pending[state] = Pending(base, verifier)
        return URLBuilder("$base/mobile/authorize").apply {
            parameters.append("code_challenge", pkceChallenge(verifier))
            parameters.append("state", state)
            parameters.append("redirect_uri", REDIRECT)
            parameters.append("device", device)
        }.buildString()
    }

    /** Opens the approval page for `server` in the browser sheet. */
    fun start(server: String) = openAuthBrowser(begin(server, deviceName))

    /** What a pairing link says, or null when it isn't one or names anything but an http(s) server. */
    fun pairing(link: String): Pairing? {
        val url = runCatching { Url(link) }.getOrNull() ?: return null
        if (url.protocol.name != "localassistant" || url.host != "pair") return null
        val server = url.parameters["server"]?.trimEnd('/') ?: return null
        val code = url.parameters["code"]?.takeIf { it.isNotBlank() } ?: return null
        if (!server.startsWith("https://") && !server.startsWith("http://")) return null
        return Pairing(server, code)
    }

    /**
     * Trades the code in an approval's `callback` for a session.
     *
     * @throws Failure when the answer matches no attempt, or the server refuses the code.
     */
    suspend fun complete(callback: String, client: HttpClient = httpClient()): Session {
        val url = Url(callback)
        val attempt = url.parameters["state"]?.let(pending::remove) ?: throw Failure("That sign-in wasn't started here. Try again.")
        val code = url.parameters["code"] ?: throw Failure("The server didn't send a code back. Try again.")
        val token = Api.exchange(client, attempt.server, TokenRequest(code, attempt.verifier, deviceName))
        pending.clear()
        return Session(attempt.server, token.token)
    }

    /**
     * Trades a pairing code for a session: the code is the proof.
     *
     * @throws Failure when the server refuses the code.
     */
    suspend fun pair(pairing: Pairing, client: HttpClient = httpClient()): Session {
        val token = Api.exchange(client, pairing.server, TokenRequest(pairing.code, null, deviceName))
        pending.clear()
        return Session(pairing.server, token.token)
    }
}
