package dev.localassistant.app

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.UnfoldMore
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** What an input named `value:<name>` holds for `field` to begin with: the saved value, else the field's default. */
fun initialValue(field: PluginField, saved: JsonObject?): String {
    fun text(element: JsonElement?): String? = (element as? JsonPrimitive)?.takeIf { element !is JsonNull }?.content
    return text(saved?.get(field.name)) ?: text(field.default) ?: ""
}

/** The form keys and starting values for `fields`, as the web form names its inputs. */
fun initialValues(fields: List<PluginField>, saved: JsonObject?): Map<String, String> =
    fields.associate { "value:${it.name}" to if (isSecret(it)) "" else initialValue(it, saved) }

/** Whether a choice field takes its options from its integration, listing none itself. */
fun suppliesChoices(field: PluginField): Boolean = field.type == "choice" && field.choices.isEmpty()

/** Whether a device was added from its integration's form rather than discovered: one of its stored fields is one of the form's. */
fun addedFromForm(fields: JsonObject?, form: PluginDeviceForm?): Boolean = form?.fields.orEmpty().any { fields?.containsKey(it.name) == true }

/** Whether a field holds a secret: never sent back, empty keeps the stored one. */
fun isSecret(field: PluginField): Boolean = field.type == "secret" || field.type == "headers"

/** A text field with its label and the server's first complaint about it. */
@Composable
fun FormText(
    value: String,
    onChange: (String) -> Unit,
    label: String,
    error: String?,
    placeholder: String? = null,
    description: String? = null,
    keyboard: KeyboardType = KeyboardType.Text,
    secret: Boolean = false,
    lines: Int = 1,
) {
    OutlinedTextField(
        value,
        onChange,
        Modifier.fillMaxWidth(),
        label = { Text(label) },
        placeholder = placeholder?.let { { Text(it) } },
        supportingText = (error ?: description)?.let { { Text(it) } },
        isError = error != null,
        singleLine = lines == 1,
        minLines = lines,
        keyboardOptions = KeyboardOptions(keyboardType = keyboard),
        visualTransformation = if (secret) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
    )
}

/** A choice among `options`, shown as its current label; tapping opens a sheet listing them all. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Picker(label: String, options: List<Pair<String, String>>, value: String, error: String? = null, placeholder: String = "Pick one", onPick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val current = options.firstOrNull { it.first == value }?.second ?: ""
    Column {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp)
                .clickable { open = true }
                .semantics { contentDescription = "$label: $current" }
                .padding(vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(current.ifEmpty { placeholder }, style = MaterialTheme.typography.bodyLarge)
            }
            Icon(Icons.Rounded.UnfoldMore, null)
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
    }
    if (open) {
        ModalBottomSheet(onDismissRequest = { open = false }) {
            LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
                item { Text(label, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp)) }
                items(options, key = { it.first }) { (option, text) ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = 52.dp)
                            .clickable {
                                onPick(option)
                                open = false
                            }
                            .padding(horizontal = 24.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(text, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
                        if (option == value) Icon(Icons.Rounded.Check, null, tint = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
    }
}

/** A row of chips picking one of `options`. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ChipChoice(options: List<Pair<String, String>>, selected: String?, onPick: (String) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        for ((value, label) in options) {
            FilterChip(selected = value == selected, onClick = { if (value != selected) onPick(value) }, label = { Text(label) })
        }
    }
}

/** A choice whose options its integration supplies through `choices`, asked when the form opens; a failure shows as its error. */
@Composable
private fun SuppliedPicker(field: PluginField, value: String, error: String?, choices: suspend (String) -> List<FieldChoice>, onPick: (String) -> Unit) {
    var options by remember(field.name) { mutableStateOf<List<Pair<String, String>>?>(null) }
    var failure by remember(field.name) { mutableStateOf<String?>(null) }
    LaunchedEffect(field.name) {
        runCatching { choices(field.name) }
            .onSuccess { options = it.map { choice -> choice.value to choice.label } }
            .onFailure {
                failure = it.message
                options = emptyList()
            }
    }
    Picker(field.label, options.orEmpty(), value, failure ?: error, if (options == null) "Loading the options" else "Pick one", onPick)
}

/** An integration's own form fields, keyed `value:<name>` in `values`; secrets already saved say empty keeps them, and `choices` asks for the options it supplies. */
@Composable
fun PluginFields(fields: List<PluginField>, values: Map<String, String>, secretsSet: List<String>, errors: Map<String, List<String>>, choices: suspend (String) -> List<FieldChoice>, onChange: (String, String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        for (field in fields) {
            val key = "value:${field.name}"
            val value = values[key] ?: ""
            val error = errors[key]?.firstOrNull()
            when {
                field.type == "boolean" -> Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(field.label, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
                    Switch(checked = value == "true", onCheckedChange = { onChange(key, it.toString()) }, modifier = Modifier.semantics { contentDescription = field.label })
                }
                suppliesChoices(field) -> SuppliedPicker(field, value, error, choices) { onChange(key, it) }
                field.type == "choice" && field.choices.size <= 4 -> Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(field.label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    ChipChoice(field.choices.map { it.value to it.label }, value) { onChange(key, it) }
                    (error ?: field.description)?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = if (error != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant) }
                }
                field.type == "choice" -> Picker(field.label, field.choices.map { it.value to it.label }, value, error) { onChange(key, it) }
                else -> FormText(
                    value,
                    { onChange(key, it) },
                    field.label + if (field.optional) " (optional)" else "",
                    error,
                    placeholder = if (isSecret(field) && field.name in secretsSet) "Leave empty to keep" else field.placeholder,
                    description = field.description,
                    keyboard = when {
                        field.type == "number" || field.keyboard == "decimal" -> KeyboardType.Decimal
                        field.type == "url" || field.keyboard == "url" -> KeyboardType.Uri
                        field.keyboard == "email" -> KeyboardType.Email
                        field.type == "secret" -> KeyboardType.Password
                        else -> KeyboardType.Text
                    },
                    secret = field.type == "secret",
                    lines = if (field.type == "headers") 3 else 1,
                )
            }
        }
    }
}

/** The room choices: the whole house first, then every room by name. */
fun roomOptions(house: House?): List<Pair<String, String>> = listOf("house" to "Whole house") +
    house?.rooms.orEmpty().sortedBy { it.name }.map { it.id to it.name }
