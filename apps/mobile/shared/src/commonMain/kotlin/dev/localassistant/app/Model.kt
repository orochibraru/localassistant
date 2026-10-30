package dev.localassistant.app

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** What a screen shows of an action in flight: nothing, a spinner, or why it failed. */
data class Progress(val busy: Set<String> = emptySet(), val errors: Map<String, String> = emptyMap())

/** The signed-in app's state: the house, routines, the assistant chat and the phone's reports. */
class HouseModel(val api: Api, private val scope: CoroutineScope, private val onSignedOut: () -> Unit) {
    val house = MutableStateFlow<House?>(null)
    val routines = MutableStateFlow<List<Routine>>(emptyList())
    val loadError = MutableStateFlow<String?>(null)
    val progress = MutableStateFlow(Progress())
    val turns = MutableStateFlow<List<Pair<Turn, List<String>>>>(emptyList())
    val thinking = MutableStateFlow(false)
    val chatError = MutableStateFlow<String?>(null)
    val pending = PendingChanges(scope) { deviceId, command -> guarded { api.command(deviceId, command) } }

    /** Reads the house and the routines again; a failure shows on Home until the next one works. */
    suspend fun refresh() {
        runCatching { guarded { api.house() to api.routines() } }
            .onSuccess { (fresh, list) ->
                house.value = fresh
                routines.value = list
                loadError.value = null
                pending.settle()
            }
            .onFailure { loadError.value = it.message }
    }

    /** Runs `work` under `key`, showing a spinner while it runs and its failure after. */
    fun act(key: String, work: suspend () -> Unit) {
        progress.update { Progress(it.busy + key, it.errors - key) }
        scope.launch {
            val failure = runCatching { guarded { work() } }.exceptionOrNull()
            progress.update { Progress(it.busy - key, if (failure == null) it.errors - key else it.errors + (key to (failure.message ?: "That didn't work."))) }
            if (failure == null) refresh()
        }
    }

    /** Sends `question` to the assistant with the conversation so far. */
    fun ask(question: String? = null) {
        if (question != null) {
            if (chatError.value != null && turns.value.lastOrNull()?.first?.role == "user") turns.update { it.dropLast(1) }
            turns.update { it + (Turn("user", question) to emptyList()) }
        }
        chatError.value = null
        thinking.value = true
        scope.launch {
            runCatching { guarded { api.ask(turns.value.takeLast(40).map { it.first }) } }
                .onSuccess { reply ->
                    turns.update { it + (Turn("assistant", reply.text) to reply.actions) }
                    if (reply.actions.isNotEmpty()) refresh()
                }
                .onFailure { chatError.value = it.message }
            thinking.value = false
        }
    }

    /** Starts a new conversation. */
    fun clearChat() {
        turns.value = emptyList()
        chatError.value = null
    }

    /** Sends the phone's battery and, when shared, its position; quiet when the phone isn't in the house. */
    suspend fun report() {
        val phone = Store.phoneId() ?: return
        val level = battery()
        val position = if (Store.sharesLocation()) currentPosition() else null
        runCatching {
            guarded {
                api.report(PhoneReport(phone, level.level, level.charging, platformName, position?.let { Location(it.latitude, it.longitude, it.accuracy) }))
            }
        }.onFailure { if (it.message?.contains("isn't in the house") == true) Store.savePhoneId(null) }
    }

    /** Adds this phone to the house under `name` and sends a first report. */
    fun addPhone(name: String) = act("phone") {
        Store.savePhoneId(api.registerPhone(Store.installationId(), name))
        report()
    }

    /** Signs out on the server and here. */
    fun signOut() {
        scope.launch {
            api.signOut()
            onSignedOut()
        }
    }

    private suspend fun <T> guarded(work: suspend () -> T): T = try {
        work()
    } catch (signedOut: SignedOut) {
        onSignedOut()
        throw signedOut
    }
}
