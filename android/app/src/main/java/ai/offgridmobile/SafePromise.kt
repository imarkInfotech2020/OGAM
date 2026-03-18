package ai.offgridmobile

import android.util.Log
import com.facebook.react.bridge.Promise

/**
 * Wraps a React Native [Promise] to catch [NullPointerException]s thrown when
 * the bridge is torn down before async callbacks (coroutines, executors, threads)
 * complete. Without this wrapper, calling reject/resolve on a destroyed bridge
 * crashes with an NPE inside [com.facebook.react.bridge.PromiseImpl].
 */
class SafePromise(private val promise: Promise, private val tag: String) {
    fun resolve(value: Any?) {
        try {
            promise.resolve(value)
        } catch (e: NullPointerException) {
            Log.w(tag, "Promise.resolve NPE (bridge torn down)")
        }
    }

    fun reject(code: String, message: String, throwable: Throwable? = null) {
        try {
            promise.reject(code, message, throwable)
        } catch (e: NullPointerException) {
            Log.w(tag, "Promise.reject NPE (bridge torn down): $code: $message")
        }
    }
}
