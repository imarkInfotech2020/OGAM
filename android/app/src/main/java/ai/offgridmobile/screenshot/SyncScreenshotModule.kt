package ai.offgridmobile.screenshot

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Automatic screenshot sharing on Android.
 *
 * Same module name, same method names and the same `SyncScreenshotCaptured` payload as the iOS
 * module, so the TypeScript boundary is one file with no platform branch in it: the capability is
 * whether this module is present and permitted, which is DATA, not a `Platform.OS` check.
 */
class SyncScreenshotModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
    private val watcher = ScreenshotWatcher(reactContext) { screenshot -> emit(screenshot) }

    override fun getName(): String = "SyncScreenshotModule"

    /**
     * Whether the media permission that makes screenshots readable has been granted.
     *
     * Reported rather than requested here: a permission dialog belongs to the moment the user turns
     * sharing on, which the JavaScript owner controls.
     */
    @ReactMethod
    fun hasPermission(promise: Promise) {
        promise.resolve(granted())
    }

    @ReactMethod
    fun setEnabled(enabled: Boolean) {
        watcher.setEnabled(enabled && granted())
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Observation follows the persisted Sync preference, not the JS listener count.
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Same reason as addListener.
    }

    private fun granted(): Boolean {
        val permission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            Manifest.permission.READ_MEDIA_IMAGES
        } else {
            Manifest.permission.READ_EXTERNAL_STORAGE
        }
        return ContextCompat.checkSelfPermission(reactContext, permission) ==
            PackageManager.PERMISSION_GRANTED
    }

    private fun emit(screenshot: CapturedScreenshot) {
        val payload = Arguments.createMap().apply {
            putString("syncId", screenshot.syncId)
            putString("name", screenshot.name)
            putString("mimeType", screenshot.mimeType)
            putString("filePath", screenshot.filePath)
            putDouble("fileSize", screenshot.fileSize.toDouble())
            putString("createdAt", screenshot.createdAt)
            putInt("width", screenshot.width)
            putInt("height", screenshot.height)
        }
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("SyncScreenshotCaptured", payload)
    }

    override fun invalidate() {
        watcher.setEnabled(false)
        super.invalidate()
    }
}
