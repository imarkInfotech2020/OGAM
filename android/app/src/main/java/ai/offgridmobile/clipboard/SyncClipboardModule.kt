package ai.offgridmobile.clipboard

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

internal class SyncClipboardObserver(
    private val context: Context,
    private val clipboardManager: ClipboardManager,
    private val onText: (String, Double) -> Unit,
    private val now: () -> Long = System::currentTimeMillis,
    private val accessibilityCapture: ClipboardAccessibilityCapture =
        SyncClipboardAccessibilityService.capture,
) {
    private var enabled = false
    private var lastPublishedText: String? = null
    private var lastPublishedAt = Long.MIN_VALUE
    private val accessibilityListener: (String, Long) -> Unit = { text, at ->
        publishOnce(text, at)
    }
    private val listener = ClipboardManager.OnPrimaryClipChangedListener {
        if (!enabled) return@OnPrimaryClipChangedListener
        val at = now()
        val clip = clipboardManager.primaryClip
        if (clip == null) {
            // Not an error, and the ordinary case: Android 10+ refuses `primaryClip` to an app that is
            // not on screen, so a copy made in ANOTHER app arrives here as a notification with no
            // content. Accessibility reports what was selected, which is the same text - and is the
            // whole reason that service exists. Absent it, the copy is genuinely unknowable and this
            // returns without publishing a guess.
            val selected = SyncClipboardAccessibilityService.selectionMemory.takeFor(at)
                ?: return@OnPrimaryClipChangedListener
            publishOnce(selected, at)
            return@OnPrimaryClipChangedListener
        }
        if (clip.description.label?.toString() == SYNC_CLIP_LABEL) {
            return@OnPrimaryClipChangedListener
        }
        val item = clip.getItemAt(0)
        val text = item.coerceToText(context)?.toString() ?: return@OnPrimaryClipChangedListener
        // A copy this app COULD read is the truth; the remembered selection would only compete with it,
        // and a selection left behind would be claimed by the next copy that arrives contentless.
        SyncClipboardAccessibilityService.selectionMemory.forget()
        publishOnce(text, at)
    }

    private fun publishOnce(text: String, at: Long) {
        if (!enabled) return
        val duplicate = text == lastPublishedText && at - lastPublishedAt in 0..COPY_COALESCE_MS
        if (duplicate) return
        lastPublishedText = text
        lastPublishedAt = at
        onText(text, at.toDouble())
    }

    fun setEnabled(next: Boolean) {
        if (enabled == next) return
        enabled = next
        if (next) {
            // A selection made before the user enabled Sync is not permission to publish it later.
            SyncClipboardAccessibilityService.selectionMemory.forget()
            accessibilityCapture.addListener(accessibilityListener)
            clipboardManager.addPrimaryClipChangedListener(listener)
        } else {
            clipboardManager.removePrimaryClipChangedListener(listener)
            accessibilityCapture.removeListener(accessibilityListener)
            SyncClipboardAccessibilityService.selectionMemory.forget()
            lastPublishedText = null
            lastPublishedAt = Long.MIN_VALUE
        }
    }

    fun writeText(text: String) {
        clipboardManager.setPrimaryClip(ClipData.newPlainText(SYNC_CLIP_LABEL, text))
    }

    private companion object {
        const val SYNC_CLIP_LABEL = "Off Grid Sync"
        const val COPY_COALESCE_MS = 1_000L
    }
}

class SyncClipboardModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
    private val observer = SyncClipboardObserver(
        reactContext,
        reactContext.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager,
        ::emitText,
    )

    override fun getName(): String = "SyncClipboardModule"

    override fun invalidate() {
        observer.setEnabled(false)
        super.invalidate()
    }

    @ReactMethod
    fun setEnabled(enabled: Boolean) {
        observer.setEnabled(enabled)
    }

    @ReactMethod
    fun writeText(text: String) {
        observer.writeText(text)
    }

    /**
     * Is the accessibility service switched on right now?
     *
     * A FACT, read from system settings on every call. The user can revoke it in Settings without this
     * app being told, so a remembered answer would promise a capture that cannot happen.
     */
    @ReactMethod
    fun isAccessibilityEnabled(promise: Promise) {
        promise.resolve(SyncClipboardAccessibilityService.isEnabled(reactContext))
    }

    /**
     * Open the system Accessibility screen so the user can turn it on.
     *
     * There is no runtime prompt for accessibility - the grant lives in Settings and nowhere else - so
     * taking them there is the only thing an app can do. Called from the clipboard toggle, never at
     * launch: a permission asked for before the feature is wanted reads as an app overreaching.
     */
    @ReactMethod
    fun openAccessibilitySettings() {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        reactContext.startActivity(intent)
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required by React Native's NativeEventEmitter contract.
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Observation is controlled by the persisted Sync preference, not JS listener count.
    }

    private fun emitText(text: String, timestamp: Double) {
        val payload = Arguments.createMap().apply {
            putString("text", text)
            putDouble("ts", timestamp)
        }
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("SyncClipboardChanged", payload)
    }
}
