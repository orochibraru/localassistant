package dev.localassistant.app

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.toComposeImageBitmap
import androidx.compose.ui.viewinterop.UIKitViewController
import kotlinx.cinterop.ExperimentalForeignApi
import org.jetbrains.skia.Image
import platform.AVFoundation.AVPlayer
import platform.AVFoundation.AVPlayerItem
import platform.AVFoundation.AVURLAsset
import platform.AVFoundation.pause
import platform.AVFoundation.play
import platform.AVKit.AVPlayerViewController
import platform.Foundation.NSURL

actual fun decodeImage(bytes: ByteArray): ImageBitmap? = runCatching { Image.makeFromEncoded(bytes).toComposeImageBitmap() }.getOrNull()

@OptIn(ExperimentalForeignApi::class)
@Composable
actual fun VideoPlayer(url: String, headers: Map<String, String>, modifier: Modifier) {
    val player = remember(url) {
        val asset = AVURLAsset(uRL = NSURL(string = url), options = mapOf<Any?, Any?>("AVURLAssetHTTPHeaderFieldsKey" to headers))
        AVPlayer(playerItem = AVPlayerItem(asset = asset)).apply { play() }
    }
    DisposableEffect(player) { onDispose { player.pause() } }
    UIKitViewController(factory = { AVPlayerViewController().apply { this.player = player } }, modifier = modifier, update = { it.player = player })
}
