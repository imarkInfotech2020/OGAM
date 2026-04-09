package ai.offgridmobile.download

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.database.Cursor
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import ai.offgridmobile.SafePromise
import java.util.concurrent.Executors


class DownloadManagerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    init {
        DownloadEventBridge.attach(reactContext)
    }

    private fun safeReject(promise: Promise, code: String, message: String, throwable: Throwable? = null) =
        SafePromise(promise, NAME).reject(code, message, throwable)

    private fun safeResolve(promise: Promise, value: Any?) =
        SafePromise(promise, NAME).resolve(value)

    companion object {
        const val NAME = "DownloadManagerModule"
        const val PREFS_NAME = "OffgridMobileDownloads"
        const val DOWNLOADS_KEY = "active_downloads"
        private const val POLL_INTERVAL_MS = 500L
        internal const val WATCHDOG_INTERVAL_MS = 15_000L  // Check every 15 seconds
        internal const val STUCK_THRESHOLD = 3             // 3 × 15s = 45 seconds of zero progress after first byte
        internal const val STARTUP_TIMEOUT_POLLS = 8       // 8 × 15s = 2 minutes waiting for first byte before giving up
        internal const val MAX_RETRY_ATTEMPTS = 3          // give up after 3 retries

        internal const val STATUS_PENDING = "pending"
        internal const val STATUS_RUNNING = "running"
        internal const val STATUS_PAUSED = "paused"
        internal const val STATUS_COMPLETED = "completed"
        internal const val STATUS_FAILED = "failed"
        internal const val STATUS_UNKNOWN = "unknown"

        internal fun statusToString(status: Int): String = when (status) {
            DownloadManager.STATUS_PENDING -> STATUS_PENDING
            DownloadManager.STATUS_RUNNING -> STATUS_RUNNING
            DownloadManager.STATUS_PAUSED -> STATUS_PAUSED
            DownloadManager.STATUS_SUCCESSFUL -> STATUS_COMPLETED
            DownloadManager.STATUS_FAILED -> STATUS_FAILED
            else -> STATUS_UNKNOWN
        }

        internal fun reasonToString(status: Int, reason: Int): String {
            if (status == DownloadManager.STATUS_PAUSED) {
                return when (reason) {
                    DownloadManager.PAUSED_QUEUED_FOR_WIFI -> "Waiting for WiFi"
                    DownloadManager.PAUSED_WAITING_FOR_NETWORK -> "Waiting for network"
                    DownloadManager.PAUSED_WAITING_TO_RETRY -> "Waiting to retry"
                    else -> "Paused"
                }
            }
            if (status == DownloadManager.STATUS_FAILED) {
                return when (reason) {
                    DownloadManager.ERROR_CANNOT_RESUME -> "Cannot resume"
                    DownloadManager.ERROR_DEVICE_NOT_FOUND -> "Device not found"
                    DownloadManager.ERROR_FILE_ALREADY_EXISTS -> "File already exists"
                    DownloadManager.ERROR_FILE_ERROR -> "File error"
                    DownloadManager.ERROR_HTTP_DATA_ERROR -> "HTTP data error"
                    DownloadManager.ERROR_INSUFFICIENT_SPACE -> "Insufficient space"
                    DownloadManager.ERROR_TOO_MANY_REDIRECTS -> "Too many redirects"
                    DownloadManager.ERROR_UNHANDLED_HTTP_CODE -> "Unhandled HTTP code"
                    DownloadManager.ERROR_UNKNOWN -> "Unknown error"
                    else -> "Error: $reason"
                }
            }
            return ""
        }

        /**
         * Returns true if the given download entry should be pruned from the persisted list.
         *
         * A download is removed when:
         * - [liveStatus] is "unknown" (DownloadManager no longer tracks it), OR
         * - its stored status is "completed", the JS side has confirmed the move by
         *   setting "moveCompleted" to true, and it's been at least 5 seconds since.
         *
         * Time-based removal alone is wrong — the JS side may not call
         * moveCompletedDownload for minutes (phone sleeping, app backgrounded).
         * Only moveCompletedDownload (or explicit cleanup) should remove entries.
         *
         * The [currentTimeMs] parameter is injectable so tests can control the clock.
         */
        /**
         * Returns true if all persisted downloads are in a terminal state
         * (completed, failed, or unknown) — i.e., no download is pending,
         * running, or paused. Used to decide when to stop the foreground service.
         */
        private val ACTIVE_STATUSES = setOf(STATUS_PENDING, STATUS_RUNNING, STATUS_PAUSED)

        internal fun hasNoActiveDownloads(downloads: JSONArray): Boolean {
            for (i in 0 until downloads.length()) {
                val status = downloads.getJSONObject(i).optString("status", STATUS_PENDING)
                if (status in ACTIVE_STATUSES) return false
            }
            return true
        }

        internal fun shouldRemoveDownload(
            download: JSONObject,
            liveStatus: String,
            currentTimeMs: Long = System.currentTimeMillis(),
        ): Boolean {
            if (liveStatus == STATUS_UNKNOWN) return true
            if (download.optString("status", STATUS_PENDING) == STATUS_COMPLETED) {
                val moveCompleted = download.optBoolean("moveCompleted", false)
                if (moveCompleted) {
                    val completedAt = download.optLong("completedAt", 0L)
                    val ageMs = currentTimeMs - completedAt
                    return completedAt > 0 && ageMs > 5_000
                }
            }
            return false
        }

        internal fun evaluateStuckProgress(track: BytesTrack, currentBytes: Long): StuckAction {
            val bytesDelta = currentBytes - track.lastBytes
            if (bytesDelta > 0) {
                // Progress made — reset stuck counter
                return StuckAction.ResetCounter(BytesTrack(currentBytes, 0, track.retryCount))
            }

            val newCount = track.unchangedCount + 1

            if (track.lastBytes == 0L && currentBytes == 0L) {
                // Download hasn't received its first byte yet (still connecting / CDN handshake).
                // Wait up to STARTUP_TIMEOUT_POLLS before giving up — no auto-retry, let the user decide.
                if (newCount >= STARTUP_TIMEOUT_POLLS) return StuckAction.StartupTimeout
                return StuckAction.IncrementCounter(BytesTrack(0L, newCount, track.retryCount))
            }

            // Was downloading but has now frozen — use the shorter stuck threshold
            if (newCount >= STUCK_THRESHOLD) {
                if (track.retryCount >= MAX_RETRY_ATTEMPTS) return StuckAction.GiveUp
                return StuckAction.Retry(track.retryCount + 1)
            }
            return StuckAction.IncrementCounter(BytesTrack(track.lastBytes, newCount, track.retryCount))
        }
    }

    /** Tracks byte progress for a single download across watchdog poll intervals. */
    internal data class BytesTrack(val lastBytes: Long, val unchangedCount: Int, val retryCount: Int = 0)

    /**
     * Result of [evaluateStuckProgress] — tells the watchdog what to do next.
     *
     * - [ResetCounter] — progress was made, reset the stuck counter
     * - [IncrementCounter] — no progress, increment counter (not stuck yet)
     * - [Retry] — stuck threshold reached, retry the download
     * - [GiveUp] — max retries exhausted, give up
     */
    internal sealed class StuckAction {
        data class ResetCounter(val newTrack: BytesTrack) : StuckAction()
        data class IncrementCounter(val newTrack: BytesTrack) : StuckAction()
        data class Retry(val retryCount: Int) : StuckAction()
        object GiveUp : StuckAction()
        object StartupTimeout : StuckAction() // never received first byte — let user retry
    }

    private val executor = Executors.newSingleThreadExecutor()

    private val allowedDownloadHosts = setOf(
        "huggingface.co",
        "cdn-lfs.huggingface.co",
        "cas-bridge.xethub.hf.co",
    )

    private val downloadManager: DownloadManager by lazy {
        reactApplicationContext.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
    }

    private val sharedPrefs: SharedPreferences by lazy {
        reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    // --- Progress polling (500ms) ---
    private val handler = Handler(Looper.getMainLooper())
    private var isPolling = false
    private val pollRunnable = object : Runnable {
        override fun run() {
            if (isPolling) {
                pollWorkerDownloads()
                pollAllDownloads()
                handler.postDelayed(this, POLL_INTERVAL_MS)
            }
        }
    }

    // --- Stuck-download watchdog ---
    private val watchdogHandler = Handler(Looper.getMainLooper())
    private val downloadBytesTracker = mutableMapOf<Long, BytesTrack>()

    private val watchdogRunnable = object : Runnable {
        override fun run() {
            if (isPolling && networkAvailable) {
                checkForStuckDownloads()
            }
            if (isPolling) {
                watchdogHandler.postDelayed(this, WATCHDOG_INTERVAL_MS)
            }
        }
    }

    // --- Network connectivity ---
    @Volatile private var networkAvailable = true
    private var networkCallbackRegistered = false
    private val useWorkerDownloader = true

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            android.util.Log.d("DownloadService", "Network available - checking download status")
            networkAvailable = true
            handler.post { checkNetworkRestored() }
        }

        override fun onLost(network: Network) {
            android.util.Log.d("DownloadService", "Network lost - download paused")
            networkAvailable = false
        }
    }

    override fun getName(): String = NAME

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        isPolling = false
        handler.removeCallbacks(pollRunnable)
        watchdogHandler.removeCallbacksAndMessages(null) // clears watchdog + any pending retry postDelayed callbacks
        unregisterNetworkCallback()
        if (!executor.isShutdown) {
            executor.shutdown()
        }
    }

    @ReactMethod
    fun startDownload(params: ReadableMap, promise: Promise) {
        val url = params.getString("url") ?: run {
            safeReject(promise, "DOWNLOAD_ERROR", "URL is required")
            return
        }
        val fileName = params.getString("fileName")?.let { File(it).name } ?: run {
            safeReject(promise, "DOWNLOAD_ERROR", "fileName is required")
            return
        }
        val title = params.getString("title") ?: fileName
        val description = params.getString("description") ?: "Downloading model..."
        val modelId = params.getString("modelId") ?: ""
        val totalBytes = if (params.hasKey("totalBytes")) params.getDouble("totalBytes").toLong() else 0L
        val hideNotification = params.hasKey("hideNotification") && params.getBoolean("hideNotification")

        // Validate URL against allowed download hosts to prevent SSRF
        val parsedHost = try { URL(url).host } catch (_: Exception) { null }
        if (parsedHost == null || !allowedDownloadHosts.any { parsedHost == it || parsedHost.endsWith(".$it") }) {
            safeReject(promise, "DOWNLOAD_ERROR", "Download URL host not allowed: $parsedHost")
            return
        }

        if (useWorkerDownloader) {
            try {
                val downloadId = System.currentTimeMillis()
                val downloadInfo = JSONObject().apply {
                    put("downloadId", downloadId)
                    put("url", url)
                    put("fileName", fileName)
                    put("modelId", modelId)
                    put("title", title)
                    put("description", description)
                    put("totalBytes", totalBytes)
                    put("bytesDownloaded", 0)
                    put("status", WorkerDownloadStore.STATUS_PENDING)
                    put("startedAt", System.currentTimeMillis())
                    put("backend", "worker")
                    put("localUri", Uri.fromFile(File(
                        reactApplicationContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                        fileName
                    )).toString())
                }
                WorkerDownloadStore.put(reactApplicationContext, downloadInfo)
                DownloadEventBridge.log("I", "[Module] startDownload routed to worker id=$downloadId file=$fileName model=$modelId")
                WorkerDownload.enqueue(
                    reactApplicationContext,
                    downloadId,
                    url,
                    fileName,
                    modelId,
                    title,
                    totalBytes,
                )
                val result = Arguments.createMap().apply {
                    putDouble("downloadId", downloadId.toDouble())
                    putString("fileName", fileName)
                    putString("modelId", modelId)
                }
                safeResolve(promise, result)
                return
            } catch (e: Exception) {
                DownloadEventBridge.log("E", "[Module] worker start failed, falling back to legacy: ${e.message}")
            }
        }

        // Resolve redirects on a background thread (network I/O)
        executor.execute {
            try {
                // Clean up any existing file with the same name to prevent DownloadManager
                // from auto-renaming (e.g., file.gguf → file-1.gguf)
                val existingFile = File(
                    reactApplicationContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                    fileName
                )
                if (existingFile.exists()) {
                    android.util.Log.d("DownloadService", "Deleting existing file before download: ${existingFile.absolutePath}")
                    existingFile.delete()
                }

                // Also clean up any stale entries from previous sessions
                cleanupStaleDownloads()

                // Pre-resolve redirects so DownloadManager gets the final CDN URL directly.
                // HuggingFace returns a 302 redirect to a long signed CDN URL (~1350 chars)
                // that some OEM DownloadManager implementations fail to follow silently.
                val resolvedUrl = resolveRedirects(url)
                android.util.Log.d("DownloadService", "Resolved URL: ${resolvedUrl.take(120)}...")

                val request = DownloadManager.Request(Uri.parse(resolvedUrl))
                    .setTitle(title)
                    .setDescription(description)
                    .setNotificationVisibility(
                        if (hideNotification) DownloadManager.Request.VISIBILITY_HIDDEN
                        else DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
                    )
                    .setDestinationInExternalFilesDir(
                        reactApplicationContext,
                        Environment.DIRECTORY_DOWNLOADS,
                        fileName
                    )
                    .setAllowedOverMetered(true)
                    .setAllowedOverRoaming(true)

                val downloadId = downloadManager.enqueue(request)
                android.util.Log.d("DownloadService", "Download enqueued - id: $downloadId | file: $fileName")

                // Start foreground service to prevent Android from throttling the download
                try {
                    DownloadForegroundService.start(reactApplicationContext, title, downloadId)
                } catch (e: Exception) {
                    android.util.Log.w("DownloadService", "Failed to start foreground service (non-fatal)", e)
                }

                // Persist download info
                val downloadInfo = JSONObject().apply {
                    put("downloadId", downloadId)
                    put("url", url)
                    put("fileName", fileName)
                    put("modelId", modelId)
                    put("title", title)
                    put("totalBytes", totalBytes)
                    put("status", STATUS_PENDING)
                    put("startedAt", System.currentTimeMillis())
                }
                persistDownload(downloadId, downloadInfo)

                val result = Arguments.createMap().apply {
                    putDouble("downloadId", downloadId.toDouble())
                    putString("fileName", fileName)
                    putString("modelId", modelId)
                }
                safeResolve(promise, result)
            } catch (e: Exception) {
                safeReject(promise, "DOWNLOAD_ERROR", "Failed to start download: ${e.message}", e)
            }
        }
    }

    @ReactMethod
    fun cancelDownload(downloadId: Double, promise: Promise) {
        try {
            val id = downloadId.toLong()
            val workerInfo = WorkerDownloadStore.get(reactApplicationContext, id)
            if (workerInfo != null) {
                DownloadEventBridge.log("W", "[Module] Cancelling worker download id=$id")
                WorkerDownload.cancel(reactApplicationContext, id)
                workerInfo.optString("fileName")?.let { fileName ->
                    val file = File(
                        reactApplicationContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                        fileName
                    )
                    if (file.exists()) file.delete()
                }
                WorkerDownloadStore.remove(reactApplicationContext, id)
                WorkerDownloadStore.stopForegroundServiceIfIdle(reactApplicationContext, "worker cancelled")
                safeResolve(promise, true)
                return
            }
            android.util.Log.d("DownloadService", "Cancelling download - id: $id")

            // Get download info BEFORE removing from SharedPreferences
            val downloadInfo = getDownloadInfo(id)

            downloadManager.remove(id)
            removeDownload(id)
            handler.post { downloadBytesTracker.remove(id) }

            // Clean up partial file
            downloadInfo?.optString("fileName")?.let { fileName ->
                val file = File(
                    reactApplicationContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                    fileName
                )
                if (file.exists()) {
                    file.delete()
                }
            }

            stopForegroundServiceIfIdle("cancelled")
            safeResolve(promise, true)
        } catch (e: Exception) {
            safeReject(promise, "CANCEL_ERROR", "Failed to cancel download: ${e.message}", e)
        }
    }

    @ReactMethod
    fun getActiveDownloads(promise: Promise) {
        try {
            val result = Arguments.createArray()
            val workerDownloads = WorkerDownloadStore.all(reactApplicationContext)

            for (i in 0 until workerDownloads.length()) {
                val download = workerDownloads.getJSONObject(i)
                result.pushMap(Arguments.createMap().apply {
                    putDouble("downloadId", download.optLong("downloadId").toDouble())
                    putString("fileName", download.optString("fileName"))
                    putString("modelId", download.optString("modelId"))
                    putString("title", download.optString("title"))
                    putDouble("totalBytes", download.optDouble("totalBytes", 0.0))
                    putString("status", download.optString("status", WorkerDownloadStore.STATUS_UNKNOWN))
                    putDouble("bytesDownloaded", download.optDouble("bytesDownloaded", 0.0))
                    putString("localUri", download.optString("localUri"))
                    putDouble("startedAt", download.optDouble("startedAt", 0.0))
                })
            }

            val downloads = getAllPersistedDownloads()

            for (i in 0 until downloads.length()) {
                val download = downloads.getJSONObject(i)
                val downloadId = download.getLong("downloadId")

                // Get current status from DownloadManager
                val statusInfo = queryDownloadStatus(downloadId)

                val map = Arguments.createMap().apply {
                    putDouble("downloadId", downloadId.toDouble())
                    putString("fileName", download.optString("fileName"))
                    putString("modelId", download.optString("modelId"))
                    putString("title", download.optString("title"))
                    putDouble("totalBytes", download.optDouble("totalBytes", 0.0))
                    putString("status", statusInfo.getString("status"))
                    putDouble("bytesDownloaded", statusInfo.getDouble("bytesDownloaded"))
                    putString("localUri", statusInfo.getString("localUri"))
                    putDouble("startedAt", download.optDouble("startedAt", 0.0))
                }
                result.pushMap(map)
            }

            safeResolve(promise, result)
        } catch (e: Exception) {
            safeReject(promise, "QUERY_ERROR", "Failed to get active downloads: ${e.message}", e)
        }
    }

    @ReactMethod
    fun getDownloadProgress(downloadId: Double, promise: Promise) {
        try {
            val id = downloadId.toLong()
            val workerInfo = WorkerDownloadStore.get(reactApplicationContext, id)
            if (workerInfo != null) {
                val result = Arguments.createMap().apply {
                    putDouble("downloadId", id.toDouble())
                    putDouble("bytesDownloaded", workerInfo.optDouble("bytesDownloaded", 0.0))
                    putDouble("totalBytes", workerInfo.optDouble("totalBytes", 0.0))
                    putString("status", workerInfo.optString("status", WorkerDownloadStore.STATUS_UNKNOWN))
                    putString("localUri", workerInfo.optString("localUri"))
                    putString("reason", workerInfo.optString("reason"))
                }
                safeResolve(promise, result)
                return
            }
            val statusInfo = queryDownloadStatus(id)
            val downloadInfo = getDownloadInfo(id)

            val result = Arguments.createMap().apply {
                putDouble("downloadId", id.toDouble())
                putDouble("bytesDownloaded", statusInfo.getDouble("bytesDownloaded"))
                putDouble("totalBytes", statusInfo.getDouble("totalBytes").takeIf { it > 0 }
                    ?: downloadInfo?.optDouble("totalBytes", 0.0) ?: 0.0)
                putString("status", statusInfo.getString("status"))
                putString("localUri", statusInfo.getString("localUri"))
                putString("reason", statusInfo.getString("reason"))
            }
            safeResolve(promise, result)
        } catch (e: Exception) {
            safeReject(promise, "PROGRESS_ERROR", "Failed to get download progress: ${e.message}", e)
        }
    }

    @ReactMethod
    fun moveCompletedDownload(downloadId: Double, targetPath: String, promise: Promise) {
        try {
            val id = downloadId.toLong()
            val workerInfo = WorkerDownloadStore.get(reactApplicationContext, id)
            if (workerInfo != null) {
                val fileName = workerInfo.optString("fileName")
                val sourceFile = File(
                    reactApplicationContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                    fileName
                )
                if (!sourceFile.exists()) {
                    throw IllegalArgumentException("Worker download file not found: ${sourceFile.absolutePath}")
                }
                if (targetPath.isEmpty()) {
                    DownloadEventBridge.log("I", "[Module] moveCompletedDownload cleanup-only for worker id=$id file=${sourceFile.absolutePath}")
                    WorkerDownloadStore.remove(reactApplicationContext, id)
                    WorkerDownloadStore.stopForegroundServiceIfIdle(reactApplicationContext, "worker cleanup")
                    safeResolve(promise, sourceFile.absolutePath)
                    return
                }
                val targetFile = File(targetPath)
                targetFile.parentFile?.mkdirs()
                val moved = if (sourceFile.renameTo(targetFile)) {
                    targetFile
                } else {
                    sourceFile.copyTo(targetFile, overwrite = true)
                    sourceFile.delete()
                    targetFile
                }
                DownloadEventBridge.log("I", "[Module] Worker file moved id=$id from=${sourceFile.absolutePath} to=${moved.absolutePath}")
                WorkerDownloadStore.remove(reactApplicationContext, id)
                WorkerDownloadStore.stopForegroundServiceIfIdle(reactApplicationContext, "worker moved")
                safeResolve(promise, moved.absolutePath)
                return
            }
            val downloadInfo = getDownloadInfo(id)
            val fileName = downloadInfo?.optString("fileName")
                ?: throw IllegalArgumentException("Download info not found")

            // First try to get the actual file path from DownloadManager (handles auto-renamed files)
            var sourceFile: File? = null
            val statusInfo = queryDownloadStatus(id)
            val localUri = statusInfo.getString("localUri")
            if (!localUri.isNullOrEmpty()) {
                try {
                    val uri = Uri.parse(localUri)
                    val path = uri.path
                    if (path != null) {
                        val uriFile = File(path)
                        if (uriFile.exists()) {
                            sourceFile = uriFile
                            android.util.Log.d("DownloadService", "Using DownloadManager localUri: ${uriFile.absolutePath}")
                        }
                    }
                } catch (e: Exception) {
                    android.util.Log.w("DownloadService", "Failed to resolve localUri: $localUri", e)
                }
            }

            // Fallback to persisted fileName
            if (sourceFile == null) {
                sourceFile = File(
                    reactApplicationContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                    fileName
                )
                android.util.Log.d("DownloadService", "Using persisted fileName: ${sourceFile.absolutePath}")
            }

            if (!sourceFile.exists()) {
                throw IllegalArgumentException("Downloaded file not found: ${sourceFile.absolutePath}")
            }

            val targetFile = File(targetPath)
            targetFile.parentFile?.mkdirs()

            // Move the file
            if (sourceFile.renameTo(targetFile)) {
                markMoveCompleted(id)
                safeResolve(promise, targetFile.absolutePath)
            } else {
                // If rename fails (different filesystem), copy then delete
                sourceFile.copyTo(targetFile, overwrite = true)
                if (!sourceFile.delete()) {
                    android.util.Log.w("DownloadService", "Failed to delete source file: ${sourceFile.absolutePath}")
                }
                markMoveCompleted(id)
                safeResolve(promise, targetFile.absolutePath)
            }
        } catch (e: Exception) {
            safeReject(promise, "MOVE_ERROR", "Failed to move completed download: ${e.message}", e)
        }
    }

    @ReactMethod
    fun startProgressPolling() {
        if (!isPolling) {
            DownloadEventBridge.log("I", "[Module] startProgressPolling")
            isPolling = true
            handler.post(pollRunnable)
            watchdogHandler.postDelayed(watchdogRunnable, WATCHDOG_INTERVAL_MS)
            registerNetworkCallback()
        }
    }

    @ReactMethod
    fun stopProgressPolling() {
        DownloadEventBridge.log("I", "[Module] stopProgressPolling")
        isPolling = false
        handler.removeCallbacks(pollRunnable)
        watchdogHandler.removeCallbacks(watchdogRunnable)
        unregisterNetworkCallback()
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN event emitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN event emitter
    }

    /**
     * Returns true if the app is already excluded from battery optimization.
     * On Android < M this always returns true (feature doesn't exist).
     */
    @ReactMethod
    fun isBatteryOptimizationIgnored(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                promise.resolve(true)
                return
            }
            val pm = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            val ignored = pm.isIgnoringBatteryOptimizations(reactApplicationContext.packageName)
            android.util.Log.d("DownloadService", "Battery optimization ignored: $ignored")
            promise.resolve(ignored)
        } catch (e: Exception) {
            android.util.Log.w("DownloadService", "Failed to check battery optimization: ${e.message}")
            promise.resolve(true) // fail open — don't block downloads
        }
    }

    /**
     * Opens the system dialog asking the user to exempt this app from battery optimization.
     * No-op on Android < M.
     */
    @ReactMethod
    fun requestBatteryOptimizationIgnore() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${reactApplicationContext.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(intent)
            android.util.Log.d("DownloadService", "Opened battery optimization settings")
        } catch (e: Exception) {
            android.util.Log.w("DownloadService", "Failed to open battery optimization settings: ${e.message}")
        }
    }

    // -------------------------------------------------------------------------
    // Network connectivity
    // -------------------------------------------------------------------------

    private fun registerNetworkCallback() {
        if (networkCallbackRegistered) return
        try {
            val cm = reactApplicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val request = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()
            cm.registerNetworkCallback(request, networkCallback)
            networkCallbackRegistered = true
            android.util.Log.d("DownloadService", "Network callback registered")
        } catch (e: Exception) {
            android.util.Log.w("DownloadService", "Failed to register network callback: ${e.message}")
        }
    }

    private fun unregisterNetworkCallback() {
        if (!networkCallbackRegistered) return
        try {
            val cm = reactApplicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            cm.unregisterNetworkCallback(networkCallback)
            networkCallbackRegistered = false
            android.util.Log.d("DownloadService", "Network callback unregistered")
        } catch (e: Exception) {
            android.util.Log.w("DownloadService", "Failed to unregister network callback: ${e.message}")
        }
    }

    private fun checkNetworkRestored() {
        val downloads = getAllPersistedDownloads()
        for (i in 0 until downloads.length()) {
            val download = downloads.getJSONObject(i)
            val downloadId = download.getLong("downloadId")
            val statusInfo = queryDownloadStatus(downloadId)
            val status = statusInfo.getString("status") ?: STATUS_UNKNOWN
            val reason = statusInfo.getString("reason") ?: ""
            android.util.Log.d("DownloadService", "Download status: ${status.uppercase()} - reason: $reason - id: $downloadId")
            if (status == STATUS_PAUSED) {
                android.util.Log.d("DownloadService", "Download $downloadId paused - DownloadManager will auto-resume")
            }
        }
    }

    // -------------------------------------------------------------------------
    // Stuck-download watchdog
    // -------------------------------------------------------------------------

    private fun checkForStuckDownloads() {
        val downloads = getAllPersistedDownloads()
        for (i in 0 until downloads.length()) {
            val download = downloads.getJSONObject(i)
            val downloadId = download.getLong("downloadId")

            val statusInfo = queryDownloadStatus(downloadId)
            val status = statusInfo.getString("status") ?: STATUS_UNKNOWN
            val reason = statusInfo.getString("reason") ?: ""

            android.util.Log.d("DownloadService", "Download status: ${status.uppercase()} - reason: $reason - id: $downloadId")

            if (status != STATUS_RUNNING) {
                downloadBytesTracker.remove(downloadId)
                continue
            }

            val bytesDownloaded = statusInfo.getDouble("bytesDownloaded").toLong()
            val totalBytes = (statusInfo.getDouble("totalBytes").takeIf { it > 0 }
                ?: download.optDouble("totalBytes", 0.0)).toLong()
            val percent = if (totalBytes > 0) (bytesDownloaded * 100 / totalBytes) else 0

            android.util.Log.d("DownloadService", "Progress - id: $downloadId | bytes: $bytesDownloaded / $totalBytes | percent: $percent%")

            val track = downloadBytesTracker[downloadId]
            if (track == null) {
                downloadBytesTracker[downloadId] = BytesTrack(bytesDownloaded, 0)
                continue
            }

            when (val action = evaluateStuckProgress(track, bytesDownloaded)) {
                is StuckAction.ResetCounter -> {
                    downloadBytesTracker[downloadId] = action.newTrack
                }
                is StuckAction.IncrementCounter -> {
                    val elapsedSeconds = action.newTrack.unchangedCount * WATCHDOG_INTERVAL_MS / 1000
                    if (action.newTrack.lastBytes == 0L) {
                        android.util.Log.d("DownloadService", "Waiting for first byte on download $downloadId (${elapsedSeconds}s elapsed, timeout: ${STARTUP_TIMEOUT_POLLS * WATCHDOG_INTERVAL_MS / 1000}s)")
                    } else {
                        android.util.Log.w("DownloadService", "No progress for ${elapsedSeconds}s on download $downloadId (${action.newTrack.unchangedCount}/$STUCK_THRESHOLD checks)")
                    }
                    downloadBytesTracker[downloadId] = action.newTrack
                }
                is StuckAction.Retry -> {
                    val stuckSeconds = STUCK_THRESHOLD * WATCHDOG_INTERVAL_MS / 1000
                    android.util.Log.w("DownloadService", "Download $downloadId stuck for ${stuckSeconds}s — retrying (attempt ${action.retryCount}/$MAX_RETRY_ATTEMPTS)")
                    downloadBytesTracker.remove(downloadId)
                    handleStuckDownload(downloadId, bytesDownloaded, download, action.retryCount)
                }
                is StuckAction.GiveUp -> {
                    android.util.Log.e("DownloadService", "Download $downloadId gave up after ${track.retryCount} retries")
                    downloadBytesTracker.remove(downloadId)
                    sendEvent("DownloadError", buildEventParams(downloadId, download, queryDownloadStatus(downloadId), STATUS_FAILED).also {
                        it.putString("reason", "Download stuck after ${track.retryCount} retries")
                    })
                    downloadManager.remove(downloadId)
                    removeDownload(downloadId)
                    stopForegroundServiceIfIdle("failed")
                    return
                }
                is StuckAction.StartupTimeout -> {
                    android.util.Log.e("DownloadService", "Download $downloadId failed to start after ${STARTUP_TIMEOUT_POLLS * WATCHDOG_INTERVAL_MS / 1000}s — no bytes received")
                    downloadBytesTracker.remove(downloadId)
                    sendEvent("DownloadError", buildEventParams(downloadId, download, queryDownloadStatus(downloadId), STATUS_FAILED).also {
                        it.putString("reason", "Download failed to start — please check your connection and try again")
                    })
                    downloadManager.remove(downloadId)
                    removeDownload(downloadId)
                    stopForegroundServiceIfIdle("failed")
                    return
                }
            }
        }
    }

    private fun handleStuckDownload(downloadId: Long, bytesDownloaded: Long, downloadInfo: JSONObject, retryCount: Int = 1) {
        android.util.Log.w("DownloadService", "Restarting stuck download - id: $downloadId (attempt $retryCount/$MAX_RETRY_ATTEMPTS)")

        val url = downloadInfo.optString("url", "")
        val fileName = downloadInfo.optString("fileName", "")
        val title = downloadInfo.optString("title", fileName)
        val modelId = downloadInfo.optString("modelId", "")
        val totalBytes = downloadInfo.optLong("totalBytes", 0L)

        // Step 1: resolve URL and delete partial file on background executor (network/IO)
        executor.execute {
            try {
                val resolvedUrl = resolveRedirects(url)

                val partialFile = File(
                    reactApplicationContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                    fileName
                )
                if (partialFile.exists()) {
                    android.util.Log.d("DownloadService", "Deleting partial file (${partialFile.length()}B): ${partialFile.name}")
                    partialFile.delete()
                }

                // Step 2: backoff using postDelayed — does NOT block the executor thread
                val backoffMs = retryCount * 30_000L
                android.util.Log.d("DownloadService", "Backoff ${backoffMs / 1000}s before re-enqueue (retry $retryCount/$MAX_RETRY_ATTEMPTS)")

                watchdogHandler.postDelayed({
                    // Guard: if download was cancelled during backoff, do not resurrect it
                    if (getDownloadInfo(downloadId) == null) {
                        android.util.Log.d("DownloadService", "Download $downloadId was cancelled during backoff — skipping re-enqueue")
                        return@postDelayed
                    }
                    // enqueue and persist on executor to avoid disk/network IO on main thread
                    executor.execute {
                        try {
                            val request = DownloadManager.Request(Uri.parse(resolvedUrl))
                                .setTitle(title)
                                .setDescription("Downloading model...")
                                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                                .setDestinationInExternalFilesDir(
                                    reactApplicationContext,
                                    Environment.DIRECTORY_DOWNLOADS,
                                    fileName
                                )
                                .setAllowedOverMetered(true)
                                .setAllowedOverRoaming(true)

                            val newDownloadId = downloadManager.enqueue(request)

                            // Persist new entry first, then remove old — avoids a gap where
                            // SharedPreferences is empty and the poll loop stops the foreground service
                            val newInfo = JSONObject().apply {
                                put("downloadId", newDownloadId)
                                put("url", url)
                                put("fileName", fileName)
                                put("modelId", modelId)
                                put("title", title)
                                put("totalBytes", totalBytes)
                                put("status", STATUS_PENDING)
                                put("startedAt", System.currentTimeMillis())
                            }
                            persistDownload(newDownloadId, newInfo)
                            downloadManager.remove(downloadId)
                            removeDownload(downloadId)

                            handler.post { downloadBytesTracker[newDownloadId] = BytesTrack(0L, 0, retryCount) }
                            android.util.Log.d("DownloadService", "Re-enqueued - new id: $newDownloadId (replaced: $downloadId, retry $retryCount/$MAX_RETRY_ATTEMPTS)")
                        } catch (e: Exception) {
                            android.util.Log.e("DownloadService", "Failed to re-enqueue stuck download $downloadId: ${e.message}")
                        }
                    }
                }, backoffMs)

            } catch (e: Exception) {
                android.util.Log.e("DownloadService", "Failed to prepare retry for stuck download $downloadId: ${e.message}")
            }
        }
    }

    // -------------------------------------------------------------------------
    // URL redirect resolution
    // -------------------------------------------------------------------------

    private fun isHostAllowed(host: String?): Boolean {
        if (host == null) return false
        return allowedDownloadHosts.any { host == it || host.endsWith(".$it") }
    }

    private fun followOneRedirect(currentUrl: String): String? {
        val connection = URL(currentUrl).openConnection() as HttpURLConnection
        try {
            connection.instanceFollowRedirects = false
            connection.requestMethod = "HEAD"
            connection.connectTimeout = 10_000
            connection.readTimeout = 10_000
            val responseCode = connection.responseCode
            if (responseCode !in 300..399) return null

            val location = connection.getHeaderField("Location")
            if (location.isNullOrEmpty()) return null

            val nextUrl = if (location.startsWith("http")) location
                else URL(URL(currentUrl), location).toString()

            val nextHost = try { URL(nextUrl).host } catch (_: Exception) { null }
            if (!isHostAllowed(nextHost)) {
                android.util.Log.w("DownloadService", "Redirect to unauthorized host blocked: $nextHost")
                return null
            }
            return nextUrl
        } finally {
            connection.disconnect()
        }
    }

    /**
     * Follow HTTP redirects manually and return the final URL.
     * Some OEM DownloadManager implementations silently fail on 302 redirects
     * to long signed CDN URLs (e.g. HuggingFace → xethub.hf.co).
     * By pre-resolving, DownloadManager gets the direct URL with no redirects.
     * Falls back to the original URL on any error so downloads aren't blocked.
     */
    internal fun resolveRedirects(originalUrl: String, maxRedirects: Int = 5): String {
        var currentUrl = originalUrl
        for (i in 0 until maxRedirects) {
            try {
                val nextUrl = followOneRedirect(currentUrl) ?: return currentUrl
                currentUrl = nextUrl
            } catch (e: Exception) {
                android.util.Log.w("DownloadService", "Redirect resolution failed, using original URL", e)
                return originalUrl
            }
        }
        android.util.Log.w("DownloadService", "Redirect resolution exceeded max redirects ($maxRedirects), using original URL")
        return originalUrl
    }

    // -------------------------------------------------------------------------
    // Progress polling helpers
    // -------------------------------------------------------------------------

    private fun buildEventParams(
        downloadId: Long, download: JSONObject, statusInfo: ReadableMap, status: String,
    ): WritableMap = Arguments.createMap().apply {
        putDouble("downloadId", downloadId.toDouble())
        putString("fileName", download.optString("fileName"))
        putString("modelId", download.optString("modelId"))
        putDouble("bytesDownloaded", statusInfo.getDouble("bytesDownloaded"))
        putDouble("totalBytes", statusInfo.getDouble("totalBytes").takeIf { it > 0 }
            ?: download.optDouble("totalBytes", 0.0))
        putString("status", status)
        putString("reason", statusInfo.getString("reason") ?: "")
    }

    private fun handlePollCompleted(
        downloadId: Long, eventParams: WritableMap, statusInfo: ReadableMap, completedEventSent: Boolean,
    ) {
        eventParams.putString("localUri", statusInfo.getString("localUri"))
        if (!completedEventSent) {
            android.util.Log.d("DownloadService", "Sending DownloadComplete event for $downloadId")
            sendEvent("DownloadComplete", eventParams)
            updateDownloadStatus(downloadId, STATUS_COMPLETED, statusInfo.getString("localUri"))
            stopForegroundServiceIfIdle("completed")
        }
    }

    private fun handlePollUnknown(downloadId: Long, eventParams: WritableMap, completedEventSent: Boolean) {
        android.util.Log.w("DownloadService", "Download $downloadId has unknown status - may have completed or been removed")
        val downloadInfo = getDownloadInfo(downloadId)
        val fileName = downloadInfo?.optString("fileName")
        if (fileName == null) {
            android.util.Log.d("DownloadService", "No info for unknown download $downloadId, removing stale entry")
            removeDownload(downloadId)
            downloadBytesTracker.remove(downloadId)
            stopForegroundServiceIfIdle("unknown")
            return
        }
        val file = java.io.File(
            reactApplicationContext.getExternalFilesDir(android.os.Environment.DIRECTORY_DOWNLOADS), fileName
        )
        if (file.exists() && file.length() > 0) {
            android.util.Log.d("DownloadService", "File exists, treating as completed: ${file.absolutePath}")
            eventParams.putString("localUri", file.toURI().toString())
            if (!completedEventSent) sendEvent("DownloadComplete", eventParams)
            updateDownloadStatus(downloadId, STATUS_COMPLETED, file.toURI().toString())
        } else {
            android.util.Log.d("DownloadService", "No file found for unknown download $downloadId, removing stale entry")
            removeDownload(downloadId)
            downloadBytesTracker.remove(downloadId)
        }
        stopForegroundServiceIfIdle("completed")
    }

    private fun pollAllDownloads() {
        val downloads = getAllPersistedDownloads()

        for (i in 0 until downloads.length()) {
            val download = downloads.getJSONObject(i)
            val downloadId = download.getLong("downloadId")

            val statusInfo = queryDownloadStatus(downloadId)
            val status = statusInfo.getString("status") ?: STATUS_UNKNOWN
            val eventParams = buildEventParams(downloadId, download, statusInfo, status)
            val completedEventSent = download.optBoolean("completedEventSent", false)

            when (status) {
                STATUS_COMPLETED -> handlePollCompleted(downloadId, eventParams, statusInfo, completedEventSent)
                STATUS_FAILED -> {
                    eventParams.putString("reason", statusInfo.getString("reason"))
                    sendEvent("DownloadError", eventParams)
                    removeDownload(downloadId)
                    downloadBytesTracker.remove(downloadId)
                    stopForegroundServiceIfIdle("failed")
                }
                STATUS_PAUSED -> {
                    eventParams.putString("reason", statusInfo.getString("reason"))
                    sendEvent("DownloadProgress", eventParams)
                }
                STATUS_RUNNING, STATUS_PENDING -> sendEvent("DownloadProgress", eventParams)
                STATUS_UNKNOWN -> handlePollUnknown(downloadId, eventParams, completedEventSent)
            }
        }
    }

    // -------------------------------------------------------------------------
    // DownloadManager query helpers
    // -------------------------------------------------------------------------

    private fun buildUnknownStatusMap(reason: String): WritableMap = Arguments.createMap().apply {
        putDouble("bytesDownloaded", 0.0)
        putDouble("totalBytes", 0.0)
        putString("localUri", "")
        putString("status", STATUS_UNKNOWN)
        putString("reason", reason)
    }

    private fun buildStatusFromCursor(cursor: Cursor): WritableMap {
        val bytesDownloadedIdx = cursor.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)
        val totalBytesIdx = cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)
        val statusIdx = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
        val reasonIdx = cursor.getColumnIndex(DownloadManager.COLUMN_REASON)
        val localUriIdx = cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI)

        val bytesDownloaded = if (bytesDownloadedIdx >= 0) cursor.getLong(bytesDownloadedIdx) else 0L
        val totalBytes = if (totalBytesIdx >= 0) cursor.getLong(totalBytesIdx) else 0L
        val status = if (statusIdx >= 0) cursor.getInt(statusIdx) else DownloadManager.STATUS_PENDING
        val reason = if (reasonIdx >= 0) cursor.getInt(reasonIdx) else 0
        val localUri = if (localUriIdx >= 0) cursor.getString(localUriIdx) else null

        return Arguments.createMap().apply {
            putDouble("bytesDownloaded", bytesDownloaded.toDouble())
            putDouble("totalBytes", totalBytes.toDouble())
            putString("localUri", localUri ?: "")
            putString("status", statusToString(status))
            putString("reason", reasonToString(status, reason))
        }
    }

    private fun queryDownloadStatus(downloadId: Long): ReadableMap {
        val query = DownloadManager.Query().setFilterById(downloadId)
        val cursor: Cursor? = downloadManager.query(query)

        cursor?.use {
            return if (it.moveToFirst()) buildStatusFromCursor(it)
                else buildUnknownStatusMap("Download not found")
        }

        return buildUnknownStatusMap("Query failed")
    }

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    private fun pollWorkerDownloads() {
        val downloads = WorkerDownloadStore.all(reactApplicationContext)
        for (i in 0 until downloads.length()) {
            val download = downloads.getJSONObject(i)
            val status = download.optString("status", WorkerDownloadStore.STATUS_UNKNOWN)
            if (status != WorkerDownloadStore.STATUS_RUNNING && status != WorkerDownloadStore.STATUS_PENDING) continue
            val downloadId = download.optLong("downloadId")
            DownloadEventBridge.progress(
                downloadId,
                download.optString("fileName"),
                download.optString("modelId"),
                download.optLong("bytesDownloaded"),
                download.optLong("totalBytes"),
                status,
                download.optString("reason").ifEmpty { null },
            )
        }
    }

    // -------------------------------------------------------------------------
    // SharedPreferences persistence
    // -------------------------------------------------------------------------

    private fun persistDownload(downloadId: Long, info: JSONObject) {
        val downloads = getAllPersistedDownloads()

        // Update or add the download
        var found = false
        for (i in 0 until downloads.length()) {
            val existing = downloads.getJSONObject(i)
            if (existing.getLong("downloadId") == downloadId) {
                downloads.put(i, info)
                found = true
                break
            }
        }
        if (!found) {
            downloads.put(info)
        }

        sharedPrefs.edit().putString(DOWNLOADS_KEY, downloads.toString()).apply()
    }

    private fun updateDownloadStatus(downloadId: Long, status: String, localUri: String?) {
        val info = getDownloadInfo(downloadId)
        if (info != null) {
            info.put("status", status)
            if (localUri != null) {
                info.put("localUri", localUri)
            }
            if (status == STATUS_COMPLETED) {
                info.put("completedAt", System.currentTimeMillis())
                info.put("completedEventSent", true)
            }
            persistDownload(downloadId, info)
        }
    }

    private fun markMoveCompleted(downloadId: Long) {
        val info = getDownloadInfo(downloadId)
        if (info != null) {
            info.put("moveCompleted", true)
            persistDownload(downloadId, info)
        } else {
            // Info already cleaned up — nothing to mark
        }
    }

    private fun removeDownload(downloadId: Long) {
        val downloads = getAllPersistedDownloads()
        val newDownloads = JSONArray()

        for (i in 0 until downloads.length()) {
            val download = downloads.getJSONObject(i)
            if (download.getLong("downloadId") != downloadId) {
                newDownloads.put(download)
            }
        }

        sharedPrefs.edit().putString(DOWNLOADS_KEY, newDownloads.toString()).apply()
    }

    private fun getDownloadInfo(downloadId: Long): JSONObject? {
        val downloads = getAllPersistedDownloads()
        for (i in 0 until downloads.length()) {
            val download = downloads.getJSONObject(i)
            if (download.getLong("downloadId") == downloadId) {
                return download
            }
        }
        return null
    }

    /**
     * Clean up stale download entries from SharedPreferences.
     * Removes entries where DownloadManager no longer has the download (status=unknown)
     * or entries that have been moved to their final location by moveCompletedDownload.
     */
    private fun cleanupStaleDownloads() {
        val downloads = getAllPersistedDownloads()
        val cleanedDownloads = JSONArray()
        var removedCount = 0

        for (i in 0 until downloads.length()) {
            val download = downloads.getJSONObject(i)
            val downloadId = download.getLong("downloadId")
            val statusInfo = queryDownloadStatus(downloadId)
            val status = statusInfo.getString("status")
            val previousStatus = download.optString("status", STATUS_PENDING)

            if (shouldRemoveDownload(download, status ?: STATUS_UNKNOWN)) {
                android.util.Log.d("DownloadService", "Cleanup: removing download $downloadId (liveStatus=$status, storedStatus=$previousStatus)")
                removedCount++
                continue
            }

            if (previousStatus == STATUS_COMPLETED && download.optLong("completedAt", 0L) > 0 && !download.optBoolean("completedEventSent", false)) {
                android.util.Log.w("DownloadService", "Cleanup: found completed download $downloadId without event sent - will retry in polling")
            }

            cleanedDownloads.put(download)
        }

        if (removedCount > 0) {
            android.util.Log.d("DownloadService", "Cleanup: removed $removedCount stale entries")
            sharedPrefs.edit().putString(DOWNLOADS_KEY, cleanedDownloads.toString()).apply()
        }
    }

    private fun getAllPersistedDownloads(): JSONArray {
        val json = sharedPrefs.getString(DOWNLOADS_KEY, "[]") ?: "[]"
        return try {
            JSONArray(json)
        } catch (e: Exception) {
            JSONArray()
        }
    }

    /**
     * Stop the foreground service if no downloads are still active
     * (pending, running, or paused).
     */
    private fun stopForegroundServiceIfIdle(reason: String = "completed") {
        if (!hasNoActiveDownloads(getAllPersistedDownloads())) return
        try {
            DownloadForegroundService.stop(reactApplicationContext, reason)
        } catch (e: Exception) {
            android.util.Log.w("DownloadService", "Failed to stop foreground service (non-fatal): ${e.message}", e)
        }
    }
}
