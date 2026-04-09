package ai.offgridmobile.download

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

object WorkerDownloadStore {
    private const val PREFS_NAME = "OffgridWorkerDownloads"
    private const val DOWNLOADS_KEY = "downloads"

    const val STATUS_PENDING = "pending"
    const val STATUS_RUNNING = "running"
    const val STATUS_PAUSED = "paused"
    const val STATUS_COMPLETED = "completed"
    const val STATUS_FAILED = "failed"
    const val STATUS_CANCELLED = "cancelled"
    const val STATUS_UNKNOWN = "unknown"

    private val ACTIVE_STATUSES = setOf(STATUS_PENDING, STATUS_RUNNING, STATUS_PAUSED)

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    @Synchronized
    fun all(context: Context): JSONArray {
        val raw = prefs(context).getString(DOWNLOADS_KEY, "[]") ?: "[]"
        return try { JSONArray(raw) } catch (_: Exception) { JSONArray() }
    }

    @Synchronized
    fun saveAll(context: Context, downloads: JSONArray) {
        prefs(context).edit().putString(DOWNLOADS_KEY, downloads.toString()).apply()
    }

    @Synchronized
    fun put(context: Context, info: JSONObject) {
        val downloads = all(context)
        var replaced = false
        for (i in 0 until downloads.length()) {
            if (downloads.getJSONObject(i).optLong("downloadId") == info.optLong("downloadId")) {
                downloads.put(i, info)
                replaced = true
                break
            }
        }
        if (!replaced) downloads.put(info)
        saveAll(context, downloads)
    }

    @Synchronized
    fun get(context: Context, downloadId: Long): JSONObject? {
        val downloads = all(context)
        for (i in 0 until downloads.length()) {
            val item = downloads.getJSONObject(i)
            if (item.optLong("downloadId") == downloadId) return item
        }
        return null
    }

    @Synchronized
    fun update(context: Context, downloadId: Long, mutate: (JSONObject) -> Unit): JSONObject? {
        val downloads = all(context)
        for (i in 0 until downloads.length()) {
            val item = downloads.getJSONObject(i)
            if (item.optLong("downloadId") == downloadId) {
                mutate(item)
                downloads.put(i, item)
                saveAll(context, downloads)
                return item
            }
        }
        return null
    }

    @Synchronized
    fun remove(context: Context, downloadId: Long) {
        val downloads = all(context)
        val updated = JSONArray()
        for (i in 0 until downloads.length()) {
            val item = downloads.getJSONObject(i)
            if (item.optLong("downloadId") != downloadId) updated.put(item)
        }
        saveAll(context, updated)
    }

    @Synchronized
    fun hasActiveWorkerDownloads(context: Context): Boolean {
        val downloads = all(context)
        for (i in 0 until downloads.length()) {
            if (downloads.getJSONObject(i).optString("status") in ACTIVE_STATUSES) return true
        }
        return false
    }

    @Synchronized
    fun hasActiveLegacyDownloads(context: Context): Boolean {
        val raw = context.getSharedPreferences(
            DownloadManagerModule.PREFS_NAME,
            Context.MODE_PRIVATE
        ).getString(DownloadManagerModule.DOWNLOADS_KEY, "[]") ?: "[]"
        val downloads = try { JSONArray(raw) } catch (_: Exception) { JSONArray() }
        for (i in 0 until downloads.length()) {
            val status = downloads.getJSONObject(i).optString("status", DownloadManagerModule.STATUS_PENDING)
            if (status == DownloadManagerModule.STATUS_PENDING ||
                status == DownloadManagerModule.STATUS_RUNNING ||
                status == DownloadManagerModule.STATUS_PAUSED) return true
        }
        return false
    }

    fun stopForegroundServiceIfIdle(context: Context, reason: String) {
        if (!hasActiveWorkerDownloads(context) && !hasActiveLegacyDownloads(context)) {
            DownloadEventBridge.log("I", "[WorkerStore] Stopping foreground service: $reason")
            DownloadForegroundService.stop(context, reason)
        }
    }
}
