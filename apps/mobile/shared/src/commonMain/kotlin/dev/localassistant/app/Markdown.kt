package dev.localassistant.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp

/** A block of an assistant's Markdown reply. */
sealed interface MarkdownBlock {
    data class Paragraph(val text: String) : MarkdownBlock

    data class Heading(val text: String) : MarkdownBlock

    data class Item(val marker: String, val text: String) : MarkdownBlock

    data class Code(val text: String) : MarkdownBlock
}

private val inlinePattern = Regex("""(\*\*|__)(.+?)\1|(\*|_)(?!\s)(.+?)(?<!\s)\3|`([^`]+)`""")
private val itemPattern = Regex("""^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$""")
private val headingPattern = Regex("""^#{1,6}\s+(.*)$""")

/** Splits Markdown into paragraphs, headings, list items and code fences. */
fun parseMarkdown(source: String): List<MarkdownBlock> {
    val blocks = mutableListOf<MarkdownBlock>()
    val paragraph = mutableListOf<String>()
    fun close() {
        if (paragraph.isNotEmpty()) {
            blocks += MarkdownBlock.Paragraph(paragraph.joinToString(" "))
            paragraph.clear()
        }
    }
    val lines = source.replace("\r\n", "\n").lines()
    var index = 0
    while (index < lines.size) {
        val line = lines[index]
        val item = itemPattern.find(line)
        val heading = headingPattern.find(line)
        when {
            line.trimStart().startsWith("```") -> {
                close()
                val code = mutableListOf<String>()
                index += 1
                while (index < lines.size && !lines[index].trimStart().startsWith("```")) {
                    code += lines[index]
                    index += 1
                }
                blocks += MarkdownBlock.Code(code.joinToString("\n"))
            }
            heading != null -> {
                close()
                blocks += MarkdownBlock.Heading(heading.groupValues[1])
            }
            item != null -> {
                close()
                blocks += MarkdownBlock.Item(if (item.groupValues[2].isNotEmpty()) "${item.groupValues[2]}." else "•", item.groupValues[3])
            }
            line.isBlank() -> close()
            else -> paragraph += line.trim()
        }
        index += 1
    }
    close()
    return blocks
}

/** `source` with its bold, italic and code spans styled. */
fun inline(source: String): AnnotatedString = buildAnnotatedString {
    var rest = source
    while (rest.isNotEmpty()) {
        val match = inlinePattern.find(rest)
        if (match == null) {
            append(rest)
            break
        }
        append(rest.substring(0, match.range.first))
        val (_, strong, _, emphasis, code) = match.destructured
        when {
            strong.isNotEmpty() -> withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(inline(strong)) }
            emphasis.isNotEmpty() -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(inline(emphasis)) }
            else -> withStyle(SpanStyle(fontFamily = FontFamily.Monospace)) { append(code) }
        }
        rest = rest.substring(match.range.last + 1)
    }
}

/** An assistant's reply, drawn from its Markdown. */
@Composable
fun Markdown(text: String, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        for (block in parseMarkdown(text)) {
            when (block) {
                is MarkdownBlock.Paragraph -> Text(inline(block.text), style = MaterialTheme.typography.bodyLarge)
                is MarkdownBlock.Heading -> Text(inline(block.text), style = MaterialTheme.typography.titleMedium)
                is MarkdownBlock.Code -> Text(block.text, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodyMedium)
                is MarkdownBlock.Item -> Row {
                    Text(block.marker, Modifier.width(22.dp), style = MaterialTheme.typography.bodyLarge)
                    Text(inline(block.text), style = MaterialTheme.typography.bodyLarge)
                }
            }
        }
    }
}
