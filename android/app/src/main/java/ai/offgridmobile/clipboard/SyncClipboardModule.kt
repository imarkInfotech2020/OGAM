package ai.offgridmobile.clipboard

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

internal class SyncClipboardObserver(
    private val context: Context,
    private val clipboardManager: ClipboardManager,
    private val onText: (String, Double) -> Unit,
    private val now: () -> Long = System::currentTimeMillis,
) {
    private var enabled = false
    private val listener = ClipboardManager.OnPrimaryClipChangedListener {
        if (!enabled) return@OnPrimaryClipChangedListener
        val clip = clipboardManager.primaryClip ?: return@OnPrimaryClipChangedListener
        if (clip.description.label?.toString() == SYNC_CLIP_LABEL) {
            return@OnPrimaryClipChangedListener
        }
        val item = clip.getItemAt(0)
        val text = item.coerceToText(context)?.toString() ?: return@OnPrimaryClipChangedListener
        onText(text, now().toDouble())
    }

    fun setEnabled(next: Boolean) {
        if (enabled == next) return
        enabled = next
        if (next) {
            clipboardManager.addPrimaryClipChangedListener(listener)
        } else {
            clipboardManager.removePrimaryClipChangedListener(listener)
        }
    }

    fun writeText(text: String) {
        clipboardManager.setPrimaryClip(ClipData.newPlainText(SYNC_CLIP_LABEL, text))
    }

    private companion object {
        const val SYNC_CLIP_LABEL = "Off Grid Sync"
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

    @ReactMethod
    fun setEnabled(enabled: Boolean) {
        observer.setEnabled(enabled)
    }

    @ReactMethod
    fun writeText(text: String) {
        observer.writeText(text)
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
