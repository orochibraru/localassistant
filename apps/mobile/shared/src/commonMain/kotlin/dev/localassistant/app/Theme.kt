package dev.localassistant.app

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

private val light = lightColorScheme(
    primary = Color(0xFFE5A100),
    onPrimary = Color(0xFF2B1D00),
    primaryContainer = Color(0xFFFFE7B0),
    onPrimaryContainer = Color(0xFF3D2A00),
    secondaryContainer = Color(0xFFF3EBDD),
    onSecondaryContainer = Color(0xFF3A3123),
    background = Color(0xFFFAF6F0),
    surface = Color(0xFFFAF6F0),
    surfaceContainer = Color(0xFFFFFFFF),
    surfaceContainerHigh = Color(0xFFF3EEE6),
    error = Color(0xFFC62828),
)

private val dark = darkColorScheme(
    primary = Color(0xFFF5B82E),
    onPrimary = Color(0xFF2B1D00),
    primaryContainer = Color(0xFF5A4100),
    onPrimaryContainer = Color(0xFFFFE7B0),
    secondaryContainer = Color(0xFF3A3328),
    onSecondaryContainer = Color(0xFFF0E6D6),
    background = Color(0xFF15120E),
    surface = Color(0xFF15120E),
    surfaceContainer = Color(0xFF221E18),
    surfaceContainerHigh = Color(0xFF2C2720),
    error = Color(0xFFEF6C6C),
)

private val shapes = Shapes(
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(20.dp),
    large = RoundedCornerShape(28.dp),
)

/** The app's colours and corners, following the phone's light or dark mode. */
@Composable
fun LocalAssistantTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) dark else light, shapes = shapes, content = content)
}
