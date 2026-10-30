package dev.localassistant.app

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class LogicTest {
    private fun device(card: String, state: JsonObject?) = Device("d", "kind", "Lamp", card, "lightbulb", state = state)

    @Test
    fun pkceIsTheUnpaddedBase64UrlSha256() {
        assertEquals("DuI6UC2WyEDXNRnRCtDVuzx7nYgOs4iske63fTZsJxE", pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gWFrSE6zM"))
    }

    @Test
    fun pairingLinksOnlyNameHttpServers() {
        assertEquals(Pairing("https://home.example", "abc"), Auth.pairing("localassistant://pair?server=https://home.example/&code=abc"))
        assertNull(Auth.pairing("localassistant://pair?server=javascript:alert(1)&code=abc"))
        assertNull(Auth.pairing("https://home.example/?code=abc"))
        assertEquals("https://home.example", Auth.address(" home.example/ "))
        assertEquals("http://10.0.0.2:3000", Auth.address("http://10.0.0.2:3000"))
    }

    @Test
    fun theSignInPageCarriesTheChallengeAndTheAppRedirect() {
        val page = io.ktor.http.Url(Auth.begin("home.example", "Pixel"))
        assertEquals("/mobile/authorize", page.encodedPath)
        assertEquals("localassistant://auth", page.parameters["redirect_uri"])
        assertEquals(43, page.parameters["code_challenge"]?.length)
    }

    @Test
    fun commandsMergeTheirChanges() {
        val first = Api.command("light") { putJsonObject("change") { put("on", true) } }
        val second = Api.command("light") { putJsonObject("change") { put("brightness", 40) } }
        assertEquals(buildJsonObject { put("on", true); put("brightness", 40) }, mergeCommands(first, second)["change"])
        val cover = mergeCommands(
            Api.command("cover") { putJsonObject("move") { put("position", 30) } },
            Api.command("cover") { putJsonObject("move") { put("action", "stop") } },
        )
        assertEquals(buildJsonObject { put("action", "stop") }, cover["move"])
    }

    @Test
    fun summariesReadLikeTheWebCards() {
        assertEquals("40% open", summary("cover", buildJsonObject { put("position", 40) }))
        assertEquals("Heat · set 21.5° · room 19°", summary("climate", buildJsonObject { put("power", true); put("mode", "heat"); put("targetTemperature", 21.5); put("roomTemperature", 19) }))
        assertEquals("On · 1.5 kW", summary("switch", buildJsonObject { put("on", true); put("power", 1500) }))
        assertEquals("Off", summary("light", buildJsonObject { put("on", false) }))
        assertEquals("Unreachable", summary("light", null, "Unreachable"))
        assertTrue(active("cover", buildJsonObject { put("position", 10) }))
    }

    @Test
    fun aTapTogglesWhatToggles() {
        val (patch, command) = toggleFor("switch", buildJsonObject { put("on", false) })!!
        assertEquals(JsonPrimitive(true), patch["on"])
        assertEquals(JsonPrimitive(true), command["on"])
        assertNull(toggleFor("sensor", buildJsonObject {}))
    }

    @Test
    fun pendingChangesDebounceShowAtOnceAndFallBackOnFailure() = runTest {
        val sent = mutableListOf<JsonObject>()
        var fail = false
        val pending = PendingChanges(this, 400) { _, command ->
            if (fail) throw Failure("The lamp didn't answer.")
            sent += command
        }
        val lamp = device("light", buildJsonObject { put("on", false); put("brightness", 10) })
        pending.change("d", buildJsonObject { put("on", true) }, Api.command("light") { putJsonObject("change") { put("on", true) } })
        pending.change("d", buildJsonObject { put("brightness", 80) }, Api.command("light") { putJsonObject("change") { put("brightness", 80) } })
        assertEquals(JsonPrimitive(80), pending.stateOf(lamp)?.get("brightness"))
        assertEquals(JsonPrimitive(true), pending.stateOf(lamp)?.get("on"))
        advanceTimeBy(500)
        runCurrent()
        assertEquals(1, sent.size)
        assertEquals(buildJsonObject { put("on", true); put("brightness", 80) }, sent.single()["change"])
        pending.settle()
        assertEquals(lamp.state, pending.stateOf(lamp))
        fail = true
        pending.change("d", buildJsonObject { put("on", true) }, Api.command("light") { putJsonObject("change") { put("on", true) } })
        advanceTimeBy(500)
        runCurrent()
        assertEquals("The lamp didn't answer.", pending.entries.value["d"]?.error)
        assertEquals(lamp.state, pending.stateOf(lamp))
    }

    @Test
    fun markdownBecomesBlocks() {
        val blocks = parseMarkdown("Two things:\n\n- **PAC** is on\n- X30 cleans\n1. first\n## Next\n```\ncode\n```")
        assertEquals(
            listOf(
                MarkdownBlock.Paragraph("Two things:"),
                MarkdownBlock.Item("•", "**PAC** is on"),
                MarkdownBlock.Item("•", "X30 cleans"),
                MarkdownBlock.Item("1.", "first"),
                MarkdownBlock.Heading("Next"),
                MarkdownBlock.Code("code"),
            ),
            blocks,
        )
        assertEquals("PAC is on", inline("**PAC** is *on*").text)
    }

    @Test
    fun theApiSendsTheTokenAndReadsServerErrors() = runTest {
        val client = HttpClient(MockEngine { request ->
            when (request.url.encodedPath) {
                "/api/v1/house" -> {
                    assertEquals("Bearer secret", request.headers[HttpHeaders.Authorization])
                    respond(
                        """{"user":{"id":"ada","name":"Ada","email":"ada@example.com","isAdmin":true},"home":{"id":"h","name":"Home","extra":1},"devices":[{"id":"d","kind":"k","name":"Lamp","card":"light","icon":"lightbulb","state":{"type":"light","on":true}}]}""",
                        headers = headersOf(HttpHeaders.ContentType, "application/json"),
                    )
                }
                "/api/v1/scenes/gone/activate" -> respond("""{"message":"That scene is gone."}""", HttpStatusCode.NotFound, headersOf(HttpHeaders.ContentType, "application/json"))
                else -> respond("", HttpStatusCode.Unauthorized)
            }
        }) {
            expectSuccess = false
            install(ContentNegotiation) { json(json) }
        }
        val api = Api(Session("https://home.example", "secret"), client)
        assertEquals("Lamp", api.house().devices.single().name)
        assertEquals("That scene is gone.", assertFailsWith<Failure> { api.activate("gone") }.message)
        assertFailsWith<SignedOut> { api.routines() }
    }
}
