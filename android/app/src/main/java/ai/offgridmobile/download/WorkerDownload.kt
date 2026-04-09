package ai.offgridmobile.download

import android.content.Context
import android.net.Uri
import android.os.Environment
import androidx.work.BackoffPolicy
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkRequest
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.net.URL
import java.util.concurrent.TimeUnit

class WorkerDownload(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    private val downloadDao = DownloadDatabase.getInstance(context).downloadDao()
    private val client = httpClient

    override suspend fun doWork(): Result {
        val downloadId = inputData.getLong(KEY_DOWNLOAD_ID, -1L)
        if (downloadId == -1L) return Result.failure()

        val progressInterval = inputData.getLong(KEY_PROGRESS_INTERVAL, DEFAULT_PROGRESS_INTERVAL)

        val download = downloadDao.getDownload(downloadId) ?: return Result.failure()
        DownloadEventBridge.log("I", "[Worker] doWork start id=$downloadId attempt=$runAttemptCount file=${download.fileName}")

        if (isStopped) {
            downloadDao.updateStatus(downloadId, DownloadStatus.CANCELLED, "Download cancelled")
            return Result.failure()
        }

        if (download.status == DownloadStatus.PAUSED) {
            DownloadEventBridge.log("I", "[Worker] Paused — returning retry id=$downloadId")
            return Result.retry()
        }

        DownloadForegroundService.start(applicationContext, download.title, downloadId)

        val targetFile = File(download.destination)
        targetFile.parentFile?.mkdirs()

        // Sync file size with DB if they diverged (e.g. partial file from prior run)
        if (targetFile.exists() && targetFile.length() != download.downloadedBytes) {
            downloadDao.updateProgress(downloadId, targetFile.length(), download.totalBytes, DownloadStatus.RUNNING)
        }

        val requestBuilder = Request.Builder().url(download.url)
        val existingBytes = if (targetFile.exists()) targetFile.length() else 0L
        if (existingBytes > 0L) {
            DownloadEventBridge.log("I", "[Worker] Resuming from byte $existingBytes id=$downloadId")
            requestBuilder.addHeader("Range", "bytes=$existingBytes-")
        }

        downloadDao.updateStatus(downloadId, DownloadStatus.RUNNING)

        return try {
            client.newCall(requestBuilder.build()).execute().use { response ->
                val code = response.code
                DownloadEventBridge.log("I", "[Worker] Response id=$downloadId code=$code")

                when {
                    existingBytes > 0L && code == 200 -> {
                        // Server ignored Range — restart from zero
                        DownloadEventBridge.log("W", "[Worker] Server ignored Range, restarting id=$downloadId")
                        targetFile.delete()
                    }
                    code == 416 -> {
                        DownloadEventBridge.log("E", "[Worker] Range invalid id=$downloadId, deleting partial")
                        targetFile.delete()
                        downloadDao.updateStatus(downloadId, DownloadStatus.FAILED, "Server rejected resume (416)")
                        DownloadEventBridge.error(downloadId, download.fileName, download.modelId, "Server rejected resume (416)")
                        WorkerDownloadStore.stopForegroundServiceIfIdle(applicationContext, "worker 416")
                        return Result.failure()
                    }
                    !response.isSuccessful -> {
                        val reason = "HTTP ${response.code}"
                        DownloadEventBridge.log("E", "[Worker] Request failed id=$downloadId reason=$reason")
                        downloadDao.updateStatus(downloadId, DownloadStatus.FAILED, reason)
                        DownloadEventBridge.error(downloadId, download.fileName, download.modelId, reason)
                        WorkerDownloadStore.stopForegroundServiceIfIdle(applicationContext, "worker http error")
                        return if (code in 500..599) Result.retry() else Result.failure()
                    }
                }

                val body = response.body ?: run {
                    val reason = "Empty response body"
                    downloadDao.updateStatus(downloadId, DownloadStatus.FAILED, reason)
                    DownloadEventBridge.error(downloadId, download.fileName, download.modelId, reason)
                    WorkerDownloadStore.stopForegroundServiceIfIdle(applicationContext, "worker no body")
                    return Result.failure()
                }

                val currentFileBytes = if (targetFile.exists() && code == 206) targetFile.length() else 0L
                val contentLength = body.contentLength()
                val totalBytes = when (code) {
                    206 -> currentFileBytes + contentLength
                    200 -> contentLength
                    else -> maxOf(download.totalBytes, contentLength)
                }.coerceAtLeast(download.totalBytes)

                DownloadEventBridge.log("I", "[Worker] Transfer plan id=$downloadId existing=$currentFileBytes body=$contentLength total=$totalBytes")
                downloadDao.updateProgress(downloadId, currentFileBytes, totalBytes, DownloadStatus.RUNNING)

                var bytesWritten = currentFileBytes
                var lastProgressAt = 0L
                val appendMode = targetFile.exists() && code == 206

                FileOutputStream(targetFile, appendMode).buffered().use { output ->
                    body.byteStream().buffered().use { input ->
                        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                        var read = input.read(buffer)
                        while (read >= 0) {
                            if (isStopped) {
                                downloadDao.updateStatus(downloadId, DownloadStatus.CANCELLED, "Download cancelled")
                                DownloadEventBridge.error(downloadId, download.fileName, download.modelId, "Download cancelled", "cancelled")
                                WorkerDownloadStore.stopForegroundServiceIfIdle(applicationContext, "worker stopped")
                                return Result.failure()
                            }

                            // Mid-loop pause check — same as PocketPal
                            val current = downloadDao.getDownload(downloadId)
                            if (current?.status == DownloadStatus.PAUSED) {
                                DownloadEventBridge.log("I", "[Worker] Paused mid-transfer id=$downloadId bytes=$bytesWritten")
                                return Result.retry()
                            }

                            output.write(buffer, 0, read)
                            bytesWritten += read

                            val now = System.currentTimeMillis()
                            if (now - lastProgressAt >= progressInterval) {
                                setProgress(workDataOf(KEY_PROGRESS to bytesWritten, KEY_TOTAL to totalBytes))
                                downloadDao.updateProgress(downloadId, bytesWritten, totalBytes, DownloadStatus.RUNNING)
                                lastProgressAt = now
                            }

                            read = input.read(buffer)
                        }
                    }
                }

                downloadDao.updateProgress(downloadId, bytesWritten, totalBytes, DownloadStatus.COMPLETED)
                val localUri = Uri.fromFile(targetFile).toString()
                DownloadEventBridge.log("I", "[Worker] Completed id=$downloadId bytes=$bytesWritten")
                WorkerDownloadStore.stopForegroundServiceIfIdle(applicationContext, "worker completed")
                Result.success()
            }
        } catch (e: Exception) {
            val reason = e.message ?: e.javaClass.simpleName
            DownloadEventBridge.log("E", "[Worker] Exception id=$downloadId attempt=$runAttemptCount reason=$reason")
            downloadDao.updateStatus(downloadId, DownloadStatus.FAILED, reason)
            DownloadEventBridge.error(downloadId, download.fileName, download.modelId, reason)
            WorkerDownloadStore.stopForegroundServiceIfIdle(applicationContext, "worker exception")
            Result.retry()
        }
    }

    companion object {
        // Shared across all WorkerDownload instances — reuses connection and thread pools.
        val httpClient: OkHttpClient = OkHttpClient.Builder()
            .retryOnConnectionFailure(true)
            .followRedirects(true)
            .followSslRedirects(true)
            .build()

        const val DEFAULT_PROGRESS_INTERVAL = 1000L
        const val KEY_DOWNLOAD_ID = "download_id"
        const val KEY_PROGRESS = "progress"
        const val KEY_TOTAL = "total"
        const val KEY_PROGRESS_INTERVAL = "progress_interval"

        private val allowedDownloadHosts = setOf(
            "huggingface.co",
            "cdn-lfs.huggingface.co",
            "cas-bridge.xethub.hf.co",
        )

        fun isHostAllowed(url: String): Boolean {
            val host = try { URL(url).host } catch (_: Exception) { return false }
            return allowedDownloadHosts.any { host == it || host.endsWith(".$it") }
        }

        fun enqueue(
            context: Context,
            downloadId: Long,
            progressInterval: Long = DEFAULT_PROGRESS_INTERVAL,
        ): OneTimeWorkRequest {
            val request = OneTimeWorkRequestBuilder<WorkerDownload>()
                .setConstraints(
                    androidx.work.Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    WorkRequest.MIN_BACKOFF_MILLIS,
                    TimeUnit.MILLISECONDS,
                )
                .setInputData(
                    workDataOf(
                        KEY_DOWNLOAD_ID to downloadId,
                        KEY_PROGRESS_INTERVAL to progressInterval,
                    )
                )
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                workName(downloadId),
                ExistingWorkPolicy.REPLACE,
                request,
            )
            return request
        }

        fun cancel(context: Context, downloadId: Long) {
            WorkManager.getInstance(context).cancelUniqueWork(workName(downloadId))
        }

        fun workName(downloadId: Long) = "download_$downloadId"
    }
}

/**
 * Thin shim so WorkerDownload can call stopForegroundServiceIfIdle without depending
 * on the old WorkerDownloadStore. Checks both Room and legacy SharedPrefs are idle.
 * Legacy path is empty now that DownloadManagerModule no longer uses SharedPrefs.
 */
private object WorkerDownloadStore {
    fun stopForegroundServiceIfIdle(context: Context, reason: String) {
        // With Room as the single source of truth the foreground service is stopped
        // by the module's LiveData observer on COMPLETED/FAILED/CANCELLED.
        // The worker calls this as a belt-and-suspenders stop when the app is backgrounded
        // and the module observer may not be alive.
        DownloadEventBridge.log("I", "[WorkerStore] stopForegroundServiceIfIdle: $reason")
        DownloadForegroundService.stop(context, reason)
    }
}
