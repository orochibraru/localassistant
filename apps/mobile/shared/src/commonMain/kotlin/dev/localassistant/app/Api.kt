package dev.localassistant.app

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.HttpRequestBuilder
import io.ktor.client.request.bearerAuth
import io.ktor.client.request.parameter
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpMethod
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

val json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
}

/** A failure with a message fit to show as is. */
open class Failure(message: String) : Exception(message)

/** The server no longer knows the session: signed out elsewhere, or expired. */
class SignedOut : Failure("Sign in again.")

/** An HTTP client for the platform, speaking JSON. */
fun httpClient(): HttpClient = HttpClient {
    expectSuccess = false
    install(ContentNegotiation) { json(json) }
    install(HttpTimeout) {
        requestTimeoutMillis = 120_000
        connectTimeoutMillis = 15_000
    }
}

@Serializable
data class TokenRequest(val code: String, val codeVerifier: String?, val device: String)

@Serializable
data class TokenResponse(val token: String, val expiresAt: String)

@Serializable
data class Account(val id: String, val name: String, val email: String, val isAdmin: Boolean)

@Serializable
data class Home(val id: String, val name: String)

@Serializable
data class Floor(val id: String, val name: String, val level: Int)

@Serializable
data class Room(val id: String, val name: String, val icon: String, val floorId: String? = null, val outdoor: Boolean = false)

@Serializable
data class Device(
    val id: String,
    val kind: String,
    val name: String,
    val card: String,
    val icon: String,
    val roomId: String? = null,
    val ownerId: String? = null,
    val state: JsonObject? = null,
    val stateError: String? = null,
)

@Serializable
data class Scene(val id: String, val name: String)

@Serializable
data class Person(val id: String, val name: String, val home: Boolean? = null, val tracked: Boolean = false)

@Serializable
data class House(
    val user: Account,
    val home: Home,
    val homes: List<Home> = emptyList(),
    val floors: List<Floor> = emptyList(),
    val rooms: List<Room> = emptyList(),
    val devices: List<Device> = emptyList(),
    val scenes: List<Scene> = emptyList(),
    val people: List<Person> = emptyList(),
    val assistant: Boolean = false,
    val unreadNotifications: Int = 0,
)

@Serializable
data class InboxAction(val action: String, val title: String)

@Serializable
data class InboxEntry(
    val id: Long,
    val title: String,
    val body: String,
    val url: String,
    val actions: List<InboxAction> = emptyList(),
    val createdAt: String,
    val readAt: String? = null,
)

@Serializable
data class Inbox(val notifications: List<InboxEntry> = emptyList(), val unread: Int = 0)

@Serializable
data class Routine(val id: String, val name: String, val enabled: Boolean)

@Serializable
data class Turn(val role: String, val text: String)

@Serializable
data class Reply(val text: String, val actions: List<String> = emptyList())

@Serializable
private data class Turns(val turns: List<Turn>)

@Serializable
private data class Enabled(val enabled: Boolean)

@Serializable
private data class PhoneRegistration(val installationId: String, val name: String)

@Serializable
private data class Registered(val deviceId: String)

@Serializable
data class Location(val latitude: Double, val longitude: Double, val accuracy: Double?)

@Serializable
data class PhoneReport(
    val deviceId: String,
    val battery: Int?,
    val charging: Boolean?,
    val platform: String,
    val location: Location? = null,
)

/** The server's `/api/v1`, signed in as `session`, looking at `homeId` when the server has several homes. */
class Api(val session: Session, private val client: HttpClient = httpClient()) {
    var homeId: String? = null

    /** The house: the account, rooms, devices with their state, scenes and people. */
    suspend fun house(): House = call(HttpMethod.Get, "/house").body()

    /** Sends `command` to a device and waits for it to answer. */
    suspend fun command(deviceId: String, command: JsonObject) {
        call(HttpMethod.Post, "/devices/$deviceId/command") { setBody(command) }
    }

    /** Sets a scene. */
    suspend fun activate(sceneId: String) {
        call(HttpMethod.Post, "/scenes/$sceneId/activate") { setBody(JsonObject(emptyMap())) }
    }

    /** This person's notifications, newest first, and how many are unread. */
    suspend fun notifications(): Inbox = call(HttpMethod.Get, "/notifications").body()

    /** Marks every notification read. */
    suspend fun markNotificationsRead() {
        call(HttpMethod.Post, "/notifications/read") { setBody(JsonObject(emptyMap())) }
    }

    /** Removes one notification. */
    suspend fun removeNotification(id: Long) {
        call(HttpMethod.Delete, "/notifications/$id")
    }

    /** Removes every notification. */
    suspend fun clearNotifications() {
        call(HttpMethod.Delete, "/notifications")
    }

    /** The routines of the home. */
    suspend fun routines(): List<Routine> = call(HttpMethod.Get, "/routines").body()

    /** Has the server run a routine now. */
    suspend fun run(routineId: String) {
        call(HttpMethod.Post, "/routines/$routineId/run") { setBody(JsonObject(emptyMap())) }
    }

    /** Turns a routine on or off. */
    suspend fun enable(routineId: String, enabled: Boolean) {
        call(HttpMethod.Patch, "/routines/$routineId") { setBody(Enabled(enabled)) }
    }

    /** The assistant's answer to the last of `turns`. */
    suspend fun ask(turns: List<Turn>): Reply = call(HttpMethod.Post, "/assistant") { setBody(Turns(turns)) }.body()

    /** Adds this phone to the house, or renames it; returns its device id. */
    suspend fun registerPhone(installationId: String, name: String): String =
        call(HttpMethod.Put, "/mobile/device") { setBody(PhoneRegistration(installationId, name)) }.body<Registered>().deviceId

    /** Sends the phone's battery and, when shared, where it is. */
    suspend fun report(report: PhoneReport) {
        call(HttpMethod.Post, "/mobile/report") { setBody(report) }
    }

    /** Ends the session on the server. */
    suspend fun signOut() {
        runCatching { call(HttpMethod.Delete, "/mobile/token") }
    }

    private suspend fun call(method: HttpMethod, path: String, build: HttpRequestBuilder.() -> Unit = {}): HttpResponse {
        val response = try {
            client.request("${session.server}/api/v1$path") {
                this.method = method
                bearerAuth(session.token)
                contentType(ContentType.Application.Json)
                homeId?.let { parameter("home", it) }
                build()
            }
        } catch (failure: Exception) {
            throw Failure("Can't reach ${session.server.substringAfter("://")}. Check the connection.")
        }
        if (response.status.value == 401) throw SignedOut()
        if (!response.status.isSuccess()) throw Failure(messageOf(response))
        return response
    }

    companion object {
        /**
         * Trades a sign-in or pairing code for a session token at `server`.
         *
         * @throws Failure when the server can't be reached or refuses the code.
         */
        suspend fun exchange(client: HttpClient, server: String, request: TokenRequest): TokenResponse {
            val response = try {
                client.request("$server/api/v1/mobile/token") {
                    method = HttpMethod.Post
                    contentType(ContentType.Application.Json)
                    setBody(request)
                }
            } catch (failure: Exception) {
                throw Failure("Can't reach ${server.substringAfter("://")}. Check the address and the connection.")
            }
            if (!response.status.isSuccess()) throw Failure(messageOf(response))
            return response.body()
        }

        /** The message in a SvelteKit error body, or a generic one. */
        suspend fun messageOf(response: HttpResponse): String {
            val text = runCatching { response.bodyAsText() }.getOrDefault("")
            val message = runCatching { json.parseToJsonElement(text) as JsonObject }.getOrNull()?.get("message")?.jsonPrimitive?.content
            return message?.takeIf { it.isNotBlank() } ?: "The server answered ${response.status.value}. Try again."
        }

        /** An empty command body of `type`. */
        fun command(type: String, build: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit = {}): JsonObject = buildJsonObject {
            put("type", type)
            build()
        }
    }
}
