package dev.localassistant.app

actual fun installedFromGitHub(): Boolean = false

actual suspend fun installPackage(apk: ByteArray) {
    throw Failure("iPhones update the app through the App Store or TestFlight.")
}
