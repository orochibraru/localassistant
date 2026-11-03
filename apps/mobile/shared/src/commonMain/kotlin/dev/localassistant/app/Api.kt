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
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

val json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
}

/** A failure with a message fit to show as is, and the form fields it's about when a form was refused. */
open class Failure(message: String, val errors: Map<String, List<String>> = emptyMap()) : Exception(message)

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
    val fields: JsonObject? = null,
)

@Serializable
data class FieldChoice(val value: String, val label: String)

@Serializable
data class PluginField(
    val name: String,
    val label: String,
    val type: String,
    val description: String? = null,
    val placeholder: String? = null,
    val optional: Boolean = false,
    val default: JsonElement? = null,
    val choices: List<FieldChoice> = emptyList(),
    val keyboard: String? = null,
)

@Serializable
data class PluginConnection(val description: String, val connected: String, val fields: List<PluginField> = emptyList(), val find: String? = null)

@Serializable
data class PluginDeviceForm(val title: String, val description: String, val fields: List<PluginField> = emptyList(), val submit: String)

@Serializable
data class PluginSetup(
    val id: String,
    val name: String,
    val description: String,
    val icon: String,
    val needs: List<String> = emptyList(),
    val connection: PluginConnection? = null,
    val device: PluginDeviceForm? = null,
    val automatic: String? = null,
    val connected: Boolean = false,
    val values: JsonObject = JsonObject(emptyMap()),
    val secretsSet: List<String> = emptyList(),
)

@Serializable
data class Householder(val id: String, val name: String)

@Serializable
data class Setups(val setups: List<PluginSetup> = emptyList(), val broker: Boolean = false, val people: List<Householder> = emptyList())

@Serializable
private data class Found(val found: Int? = null)

@Serializable
private data class Created(val id: String)

@Serializable
data class SceneMember(val deviceId: String, val command: JsonObject)

@Serializable
data class Scene(val id: String, val name: String, val members: List<SceneMember> = emptyList())

@Serializable
data class SceneDefinition(val name: String, val members: List<SceneMember>)

@Serializable
data class CameraLive(val format: String, val path: String)

@Serializable
data class CameraClip(
    val id: String,
    val label: String,
    val startedAt: String,
    val video: String? = null,
    val image: String? = null,
    val detail: String? = null,
)

@Serializable
data class CameraClips(val title: String = "Recordings", val empty: String = "Nothing yet.", val clips: List<CameraClip> = emptyList())

@Serializable
data class CameraView(
    val live: CameraLive? = null,
    val snapshot: String? = null,
    val clips: CameraClips = CameraClips(),
    val clipsError: String? = null,
)

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
private data class PushKey(val vapidPublicKey: String)

@Serializable
private data class PushRegistration(val endpoint: String, val p256dh: String, val auth: String, val device: String)

@Serializable
private data class PushEndpointBody(val endpoint: String)

@Serializable
data class PushPayload(val title: String, val body: String = "", val url: String = "/")

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

    /** What an admin can connect and add, each integration with its forms, and the accounts a device can belong to. */
    suspend fun setups(): Setups = call(HttpMethod.Get, "/setups").body()

    /** Connects an integration with its connection form's `fields`; how many devices it found, or null when they come on their own. */
    suspend fun connect(pluginId: String, fields: Map<String, String>): Int? = call(HttpMethod.Post, "/setups/$pluginId/connect") { setBody(fields) }.body<Found>().found

    /** Has an integration look for new devices; how many it found, or null when they come on their own. */
    suspend fun discover(pluginId: String): Int? = call(HttpMethod.Post, "/setups/$pluginId/discover") { setBody(JsonObject(emptyMap())) }.body<Found>().found

    /** Disconnects an integration, removing its devices. */
    suspend fun disconnect(pluginId: String) {
        call(HttpMethod.Delete, "/setups/$pluginId")
    }

    /** Adds a device through an integration's form; returns its id. */
    suspend fun addDevice(pluginId: String, fields: Map<String, String>): String = call(HttpMethod.Post, "/setups/$pluginId/devices") { setBody(fields) }.body<Created>().id

    /** Saves a device's settings: name, room, owner and its integration's fields. */
    suspend fun editDevice(deviceId: String, fields: Map<String, String>) {
        call(HttpMethod.Put, "/devices/$deviceId") { setBody(fields) }
    }

    /** Removes a device from the house. */
    suspend fun removeDevice(deviceId: String) {
        call(HttpMethod.Delete, "/devices/$deviceId")
    }

    /** Makes a scene in the home and returns it. */
    suspend fun createScene(definition: SceneDefinition): Scene = call(HttpMethod.Post, "/scenes") { setBody(definition) }.body()

    /** Changes a scene's name and what it sets, and returns it. */
    suspend fun updateScene(sceneId: String, definition: SceneDefinition): Scene = call(HttpMethod.Put, "/scenes/$sceneId") { setBody(definition) }.body()

    /** Deletes a scene. */
    suspend fun deleteScene(sceneId: String) {
        call(HttpMethod.Delete, "/scenes/$sceneId")
    }

    /** A camera's live view, latest picture and recordings. */
    suspend fun camera(deviceId: String): CameraView = call(HttpMethod.Get, "/cameras/$deviceId").body()

    /** Where a camera's `path` is served, for a player that sends [authorization] itself. */
    fun mediaUrl(deviceId: String, path: String): String = "${session.server}/media/$deviceId/$path"

    /** The header a request to [mediaUrl] needs. */
    val authorization: Map<String, String> get() = mapOf("Authorization" to "Bearer ${session.token}")

    /**
     * The bytes a camera serves at `path`, like its latest picture.
     *
     * @throws Failure when the server can't be reached or refuses.
     */
    suspend fun media(deviceId: String, path: String): ByteArray {
        val response = try {
            client.request(mediaUrl(deviceId, path)) {
                method = HttpMethod.Get
                bearerAuth(session.token)
            }
        } catch (failure: Exception) {
            throw Failure("Can't reach ${session.server.substringAfter("://")}. Check the connection.")
        }
        if (response.status.value == 401) throw SignedOut()
        if (!response.status.isSuccess()) throw Failure(messageOf(response))
        return response.body()
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

    /** The server's VAPID public key, for a push endpoint to accept its messages. */
    suspend fun pushKey(): String = call(HttpMethod.Get, "/mobile/push").body<PushKey>().vapidPublicKey

    /** Has the server push to this phone at `endpoint`, encrypted with its Web Push keys. */
    suspend fun registerPush(endpoint: String, p256dh: String, auth: String, device: String) {
        call(HttpMethod.Put, "/mobile/push") { setBody(PushRegistration(endpoint, p256dh, auth, device)) }
    }

    /** Stops the server pushing to `endpoint`. */
    suspend fun unregisterPush(endpoint: String) {
        call(HttpMethod.Delete, "/mobile/push") { setBody(PushEndpointBody(endpoint)) }
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
        if (!response.status.isSuccess()) throw failureOf(response)
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
        suspend fun messageOf(response: HttpResponse): String = failureOf(response).message ?: ""

        /** The failure an error body describes: its message, and the form fields it names when it has `errors`. */
        suspend fun failureOf(response: HttpResponse): Failure {
            val text = runCatching { response.bodyAsText() }.getOrDefault("")
            val body = runCatching { json.parseToJsonElement(text) as JsonObject }.getOrNull()
            val message = body?.get("message")?.jsonPrimitive?.content?.takeIf { it.isNotBlank() } ?: "The server answered ${response.status.value}. Try again."
            val errors = (body?.get("errors") as? JsonObject)?.mapValues { (_, value) ->
                (value as? kotlinx.serialization.json.JsonArray)?.mapNotNull { (it as? kotlinx.serialization.json.JsonPrimitive)?.content } ?: emptyList()
            } ?: emptyMap()
            return Failure(message, errors)
        }

        /** An empty command body of `type`. */
        fun command(type: String, build: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit = {}): JsonObject = buildJsonObject {
            put("type", type)
            build()
        }
    }
}
