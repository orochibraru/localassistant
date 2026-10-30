package dev.localassistant.app

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.convert
import kotlinx.cinterop.useContents
import kotlinx.cinterop.usePinned
import platform.AVFoundation.AVCaptureConnection
import platform.AVFoundation.AVCaptureDevice
import platform.AVFoundation.AVCaptureDeviceInput
import platform.AVFoundation.AVCaptureMetadataOutput
import platform.AVFoundation.AVCaptureMetadataOutputObjectsDelegateProtocol
import platform.AVFoundation.AVCaptureOutput
import platform.AVFoundation.AVCaptureSession
import platform.AVFoundation.AVCaptureVideoPreviewLayer
import platform.AVFoundation.AVLayerVideoGravityResizeAspectFill
import platform.AVFoundation.AVMediaTypeVideo
import platform.AVFoundation.AVMetadataMachineReadableCodeObject
import platform.AVFoundation.AVMetadataObjectTypeQRCode
import platform.AuthenticationServices.ASPresentationAnchor
import platform.AuthenticationServices.ASWebAuthenticationPresentationContextProvidingProtocol
import platform.AuthenticationServices.ASWebAuthenticationSession
import platform.CoreCrypto.CC_SHA256
import platform.CoreCrypto.CC_SHA256_DIGEST_LENGTH
import platform.CoreLocation.CLLocationManager
import platform.CoreLocation.CLLocationManagerDelegateProtocol
import platform.CoreLocation.kCLAuthorizationStatusAuthorizedAlways
import platform.CoreLocation.kCLAuthorizationStatusAuthorizedWhenInUse
import platform.CoreLocation.kCLAuthorizationStatusNotDetermined
import platform.Foundation.NSBundle
import platform.Foundation.NSURL
import platform.Foundation.NSUserDefaults
import platform.UIKit.UIApplication
import platform.UIKit.UIColor
import platform.UIKit.UIDevice
import platform.UIKit.UIDeviceBatteryState
import platform.UIKit.UIViewController
import platform.UIKit.UIWindow
import platform.darwin.NSObject
import platform.darwin.dispatch_async
import platform.darwin.dispatch_get_global_queue
import platform.darwin.dispatch_get_main_queue
import kotlin.math.roundToInt

@OptIn(ExperimentalForeignApi::class)
actual fun sha256(bytes: ByteArray): ByteArray {
    val digest = UByteArray(CC_SHA256_DIGEST_LENGTH)
    bytes.usePinned { input ->
        digest.usePinned { output ->
            CC_SHA256(input.addressOf(0), bytes.size.convert(), output.addressOf(0))
        }
    }
    return digest.toByteArray()
}

actual val deviceName: String get() = UIDevice.currentDevice.model

actual val platformName: String get() = "${UIDevice.currentDevice.systemName} ${UIDevice.currentDevice.systemVersion}"

private class Anchor :
    NSObject(),
    ASWebAuthenticationPresentationContextProvidingProtocol {
    override fun presentationAnchorForWebAuthenticationSession(session: ASWebAuthenticationSession): ASPresentationAnchor = UIApplication.sharedApplication.keyWindow ?: UIWindow()
}

private var authSession: ASWebAuthenticationSession? = null
private val anchor = Anchor()

actual fun openAuthBrowser(url: String) {
    val session = ASWebAuthenticationSession(NSURL(string = url), "localassistant") { callback, _ ->
        callback?.absoluteString?.let { Auth.callbacks.value = it }
        authSession = null
    }
    session.presentationContextProvider = anchor
    authSession = session
    session.start()
}

actual object Prefs {
    private val defaults get() = NSUserDefaults.standardUserDefaults

    actual fun get(key: String): String? = defaults.stringForKey(key)

    actual fun set(key: String, value: String?) {
        if (value == null) defaults.removeObjectForKey(key) else defaults.setObject(value, key)
    }
}

@Composable
actual fun PlatformBack(enabled: Boolean, onBack: () -> Unit) = Unit

actual fun canScanCodes(): Boolean = AVCaptureDevice.defaultDeviceWithMediaType(AVMediaTypeVideo) != null

private fun present(controller: UIViewController) {
    UIApplication.sharedApplication.keyWindow?.rootViewController?.presentViewController(controller, true, null)
}

@OptIn(ExperimentalForeignApi::class)
private class CodeScanner(val onCode: (String) -> Unit) :
    UIViewController(nibName = null, bundle = null),
    AVCaptureMetadataOutputObjectsDelegateProtocol {
    private val capture = AVCaptureSession()
    private val picture = AVCaptureVideoPreviewLayer(session = capture)
    private var read = false

    override fun viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor.blackColor
        val camera = AVCaptureDevice.defaultDeviceWithMediaType(AVMediaTypeVideo) ?: return
        val input = AVCaptureDeviceInput.deviceInputWithDevice(camera, null) ?: return
        if (!capture.canAddInput(input)) return
        capture.addInput(input)
        val output = AVCaptureMetadataOutput()
        if (!capture.canAddOutput(output)) return
        capture.addOutput(output)
        output.setMetadataObjectsDelegate(this, dispatch_get_main_queue())
        output.metadataObjectTypes = listOf(AVMetadataObjectTypeQRCode)
        picture.videoGravity = AVLayerVideoGravityResizeAspectFill
        view.layer.addSublayer(picture)
    }

    override fun viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        picture.frame = view.bounds
    }

    override fun viewDidAppear(animated: Boolean) {
        super.viewDidAppear(animated)
        dispatch_async(dispatch_get_global_queue(0, 0u)) { capture.startRunning() }
    }

    override fun viewDidDisappear(animated: Boolean) {
        super.viewDidDisappear(animated)
        capture.stopRunning()
    }

    override fun captureOutput(output: AVCaptureOutput, didOutputMetadataObjects: List<*>, fromConnection: AVCaptureConnection) {
        val text = didOutputMetadataObjects.filterIsInstance<AVMetadataMachineReadableCodeObject>().firstOrNull()?.stringValue
        if (read || text == null) return
        read = true
        dismissViewControllerAnimated(true) { onCode(text) }
    }
}

@Composable
actual fun rememberCodeScanner(onCode: (String) -> Unit): () -> Unit {
    val read by rememberUpdatedState(onCode)
    return { present(CodeScanner { read(it) }) }
}

actual fun battery(): Battery {
    val device = UIDevice.currentDevice
    device.batteryMonitoringEnabled = true
    val level = device.batteryLevel.takeIf { it >= 0f }?.let { (it * 100).roundToInt() }
    val state = device.batteryState
    val charging = when (state) {
        UIDeviceBatteryState.UIDeviceBatteryStateCharging, UIDeviceBatteryState.UIDeviceBatteryStateFull -> true
        UIDeviceBatteryState.UIDeviceBatteryStateUnplugged -> false
        else -> null
    }
    return Battery(level, charging)
}

private class LocationAccess :
    NSObject(),
    CLLocationManagerDelegateProtocol {
    val manager = CLLocationManager()
    var answer: ((Boolean) -> Unit)? = null

    init {
        manager.delegate = this
    }

    fun allowed(): Boolean = manager.authorizationStatus in setOf(kCLAuthorizationStatusAuthorizedWhenInUse, kCLAuthorizationStatusAuthorizedAlways)

    override fun locationManagerDidChangeAuthorization(manager: CLLocationManager) {
        if (manager.authorizationStatus == kCLAuthorizationStatusNotDetermined) return
        answer?.invoke(allowed())
        answer = null
        if (allowed()) manager.startUpdatingLocation()
    }
}

private val location = LocationAccess()

@Composable
actual fun rememberLocationAccess(onResult: (Boolean) -> Unit): () -> Unit {
    val answer by rememberUpdatedState(onResult)
    return {
        if (location.allowed()) {
            answer(true)
        } else {
            location.answer = { answer(it) }
            location.manager.requestWhenInUseAuthorization()
        }
    }
}

@OptIn(ExperimentalForeignApi::class)
actual suspend fun currentPosition(): Position? {
    if (!location.allowed()) return null
    location.manager.startUpdatingLocation()
    val fix = location.manager.location ?: return null
    return fix.coordinate.useContents { Position(latitude, longitude, fix.horizontalAccuracy.takeIf { it >= 0 }) }
}

actual val appVersion: String
    get() = NSBundle.mainBundle.infoDictionary?.get("CFBundleShortVersionString") as? String ?: "?"
