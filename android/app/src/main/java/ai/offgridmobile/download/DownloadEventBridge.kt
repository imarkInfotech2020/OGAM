package ai.offgridmobile.download

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.lang.ref.WeakReference

object DownloadEventBridge {
    private val mainHandler = Handler(Looper.getMainLooper())
    private var reactContextRef: WeakReference<ReactApplicationContext>? = null

    fun attach(reactContext: ReactApplicationContext) {
        reactContextRef = WeakReference(reactContext)
        log("I", "[Bridge] React context attached")
    }

    fun log(level: String, msg: String) {
        when (level) {
            "E" -> Log.e("DownloadBridge", msg)
            "W" -> Log.w("DownloadBridge", msg)
            "I" -> Log.i("DownloadBridge", msg)
            else -> Log.d("DownloadBridge", msg)
        }
        emit("DownloadLog") {
            putString("level", level)
            putString("msg", msg)
            putDouble("ts", System.currentTimeMillis().toDouble())
        }
    }

    fun progress(
        downloadId: Long,
        fileName: String,
        modelId: String,
        bytesDownloaded: Long,
        totalBytes: Long,
        status: String,
        reason: String? = null,
    ) {
        emit("DownloadProgress") {
            putDouble("downloadId", downloadId.toDouble())
            putString("fileName", fileName)
            putString("modelId", modelId)
            putDouble("bytesDownloaded", bytesDownloaded.toDouble())
            putDouble("totalBytes", totalBytes.toDouble())
            putString("status", status)
            putString("reason", reason ?: "")
            putDouble("percent", if (totalBytes > 0) (bytesDownloaded.toDouble() / totalBytes.toDouble()) * 100.0 else 0.0)
        }
    }

    fun complete(downloadId: Long, fileName: String, modelId: String, localUri: String, bytesDownloaded: Long, totalBytes: Long) {
        emit("DownloadComplete") {
            putDouble("downloadId", downloadId.toDouble())
            putString("fileName", fileName)
            putString("modelId", modelId)
            putDouble("bytesDownloaded", bytesDownloaded.toDouble())
            putDouble("totalBytes", totalBytes.toDouble())
            putString("status", "completed")
            putString("localUri", localUri)
        }
    }

    fun error(downloadId: Long, fileName: String, modelId: String, reason: String, status: String = "failed") {
        emit("DownloadError") {
            putDouble("downloadId", downloadId.toDouble())
            putString("fileName", fileName)
            putString("modelId", modelId)
            putString("reason", reason)
            putString("status", status)
        }
    }

    private inline fun emit(eventName: String, crossinline build: com.facebook.react.bridge.WritableMap.() -> Unit) {
        val reactContext = reactContextRef?.get() ?: return
        if (!reactContext.hasActiveReactInstance()) return
        mainHandler.post {
            val map = Arguments.createMap().apply(build)
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, map)
        }
    }
}
