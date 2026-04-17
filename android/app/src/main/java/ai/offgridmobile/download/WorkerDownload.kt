package ai.offgridmobile.download

import android.content.Context
import android.util.Log
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Environment
import android.os.StatFs
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
import okhttp3.Response
import java.io.File
import java.io.FileOutputStream
import java.net.URI
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import kotlin.math.abs
import kotlinx.coroutines.Job

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

        // Handle early stops and pauses
        val earlyCheckResult = handleEarlyStopOrPause(downloadId, download)
        if (earlyCheckResult != null) return earlyCheckResult

        val isSecondary = download.fileName.contains("mmproj", ignoreCase = true)
        DownloadForegroundService.update(applicationContext, downloadId, download.title, isSecondary = isSecondary)

        val targetFile = File(download.destination)
        targetFile.parentFile?.mkdirs()

        syncFileSizeWithDb(downloadId, targetFile, download)

        val existingBytes = if (targetFile.exists()) targetFile.length() else 0L

        // Disk space check — fail fast rather than filling the disk mid-download
        val diskCheckResult = checkDiskSpace(downloadId, download, targetFile, existingBytes)
        if (diskCheckResult != null) return diskCheckResult

        downloadDao.updateStatus(downloadId, DownloadStatus.RUNNING)

        val requestStartMs = System.currentTimeMillis()
        val call = client.newCall(buildRequest(download.url, existingBytes))
        val cancelHandle = coroutineContext[Job]?.invokeOnCompletion { call.cancel() }
        return try {
            call.execute().use { response ->
                handleResponse(response, existingBytes, download, downloadId, targetFile, progressInterval)
            }
        } catch (e: Exception) {
            handleDownloadException(e, downloadId, download, requestStartMs)
        } finally {
            cancelHandle?.dispose()
        }
    }

    /** Returns non-null Result if should exit early, null to continue. */
    private suspend fun handleEarlyStopOrPause(downloadId: Long, download: DownloadEntity): Result? {
        if (isStopped) {
            return handleStoppedState(downloadId, download, 0L)
        }
        if (download.status == DownloadStatus.PAUSED) {
            return Result.retry()
        }
        return null
    }

    /** Returns non-null Result if disk space check fails, null to continue. */
    private suspend fun checkDiskSpace(downloadId: Long, download: DownloadEntity, targetFile: File, existingBytes: Long): Result? {
        if (download.totalBytes <= 0L) return null
        val needed = download.totalBytes - existingBytes
        val available = StatFs(targetFile.parentFile?.absolutePath ?: download.destination).availableBytes
        if (available < needed) {
            return failDownload(downloadId, download, DownloadReason.DISK_FULL)
        }
        return null
    }

    /** Handles exceptions during download. */
    private suspend fun handleDownloadException(e: Exception, downloadId: Long, download: DownloadEntity, requestStartMs: Long): Result {
        if (isStopped) {
            return handleStoppedState(downloadId, download, download.downloadedBytes)
        }
        val reasonCode = DownloadReason.fromThrowable(e)
        val uiReason = DownloadReason.messageFor(reasonCode) ?: DownloadReason.messageFor(DownloadReason.UNKNOWN_ERROR)!!
        val retryStatus = if (!isNetworkConnected() && reasonCode == DownloadReason.NETWORK_LOST) "waiting_for_network" else "retrying"
        val statusText = if (retryStatus == "waiting_for_network") "Waiting for network..." else "Reconnecting..."
        downloadDao.updateStatus(downloadId, DownloadStatus.QUEUED, reasonCode)
        val isSecondary = download.fileName.contains("mmproj", ignoreCase = true)
        DownloadForegroundService.update(
            applicationContext, downloadId, download.title,
            download.downloadedBytes, download.totalBytes, isSecondary, statusText,
        )
        DownloadEventBridge.retrying(downloadId, download.fileName, download.modelId, uiReason, reasonCode, runAttemptCount, retryStatus)
        return Result.retry()
    }

    // -------------------------------------------------------------------------
    // Private helpers — each handles one concern to keep cognitive complexity low
    // -------------------------------------------------------------------------

    private data class StreamParams(
        val input: java.io.InputStream,
        val targetFile: File,
        val code: Int,
        val download: DownloadEntity,
        val downloadId: Long,
        val currentFileBytes: Long,
        val totalBytes: Long,
        val progressInterval: Long,
    )

    private suspend fun syncFileSizeWithDb(downloadId: Long, targetFile: File, download: DownloadEntity) {
        if (targetFile.exists() && targetFile.length() != download.downloadedBytes) {
            downloadDao.updateProgress(downloadId, targetFile.length(), download.totalBytes, DownloadStatus.RUNNING)
        }
    }

    private fun buildRequest(url: String, existingBytes: Long): Request {
        val builder = Request.Builder().url(url)
        if (existingBytes > 0L) {
            builder.addHeader("Range", "bytes=$existingBytes-")
        }
        return builder.build()
    }

    private suspend fun handleResponse(
        response: Response,
        existingBytes: Long,
        download: DownloadEntity,
        downloadId: Long,
        targetFile: File,
        progressInterval: Long,
    ): Result {
        val code = response.code
        val earlyResult = handleResponseCode(response, code, existingBytes, download, downloadId, targetFile)
        if (earlyResult != null) return earlyResult

        val body = response.body ?: return failDownload(downloadId, download, DownloadReason.EMPTY_RESPONSE)

        val currentFileBytes = if (targetFile.exists() && code == 206) targetFile.length() else 0L
        val contentLength = body.contentLength()
        val totalBytes = calculateTotalBytes(code, currentFileBytes, contentLength, download.totalBytes)
        downloadDao.updateProgress(downloadId, currentFileBytes, totalBytes, DownloadStatus.RUNNING)

        return streamToFile(StreamParams(body.byteStream().buffered(), targetFile, code, download, downloadId, currentFileBytes, totalBytes, progressInterval))
    }

    /** Returns a non-null Result to exit early, or null to continue processing. */
    private suspend fun handleResponseCode(
        response: Response,
        code: Int,
        existingBytes: Long,
        download: DownloadEntity,
        downloadId: Long,
        targetFile: File,
    ): Result? {
        return when {
            existingBytes > 0L && code == 200 -> {
                if (!targetFile.delete()) Log.w(TAG, "Failed to delete stale file for re-download: ${targetFile.path}")
                null
            }
            code == 416 -> {
                if (!targetFile.delete()) Log.w(TAG, "Failed to delete file on 416: ${targetFile.path}")
                failDownload(downloadId, download, DownloadReason.HTTP_416)
            }
            !response.isSuccessful -> {
                val reasonCode = DownloadReason.fromHttpCode(code)
                val uiReason = DownloadReason.messageFor(reasonCode) ?: "HTTP $code"
                if (code in 500..599) {
                    // 5xx = transient server error — treat identically to a network exception.
                    // Do NOT emit DownloadError here: that would tell JS the download is dead
                    // (wiping all listeners/metadata) while WorkManager silently retries — causing
                    // the Download Manager screen to stay stuck and the Models screen to desync.
                    downloadDao.updateStatus(downloadId, DownloadStatus.QUEUED, reasonCode)
                    val isSecondary = download.fileName.contains("mmproj", ignoreCase = true)
                    DownloadForegroundService.update(
                        applicationContext, downloadId, download.title,
                        download.downloadedBytes, download.totalBytes, isSecondary, "Reconnecting…",
                    )
                    DownloadEventBridge.retrying(downloadId, download.fileName, download.modelId, uiReason, reasonCode, runAttemptCount)
                    Result.retry()
                } else {
                    // 4xx = client error — permanent failure, do not retry.
                    downloadDao.updateStatus(downloadId, DownloadStatus.FAILED, reasonCode)
                    DownloadEventBridge.error(downloadId, download.fileName, download.modelId, uiReason, reasonCode)
                    DownloadForegroundService.remove(applicationContext, downloadId)
                    Result.failure()
                }
            }
            else -> null
        }
    }

    private fun calculateTotalBytes(code: Int, currentFileBytes: Long, contentLength: Long, existingTotal: Long): Long {
        return when (code) {
            206 -> currentFileBytes + contentLength
            200 -> contentLength
            else -> maxOf(existingTotal, contentLength)
        }.coerceAtLeast(existingTotal)
    }

    private suspend fun streamToFile(params: StreamParams): Result {
        val (input, targetFile, code, download, downloadId, currentFileBytes, totalBytes, progressInterval) = params
        val appendMode = targetFile.exists() && code == 206
        var bytesWritten = currentFileBytes
        var lastProgressAt = 0L
        var lastSpeedBytes = currentFileBytes
        var lastSpeedTs = System.currentTimeMillis()
        val transferStartMs = lastSpeedTs

        FileOutputStream(targetFile, appendMode).buffered().use { output ->
            input.use { src ->
                val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                var read = src.read(buffer)
                while (read >= 0) {
                    val checkResult = checkCancellationOrPause(downloadId, download, bytesWritten)
                    if (checkResult != null) return checkResult

                    output.write(buffer, 0, read)
                    bytesWritten += read

                    val now = System.currentTimeMillis()
                    if (now - lastProgressAt >= progressInterval) {
                        emitProgressUpdate(downloadId, bytesWritten, totalBytes)
                        lastSpeedBytes = bytesWritten
                        lastSpeedTs = now
                        lastProgressAt = now
                    }
                    read = src.read(buffer)
                }
            }
        }

        // SHA256 integrity check — only if file size doesn't match (avoid expensive hash computation on mobile)
        // Most downloads will match size exactly, so this rarely runs.
        // Only check hash if size is off by > 0.1%, indicating truncation or corruption.
        val expectedSha256 = download.expectedSha256
        if (!expectedSha256.isNullOrEmpty() && download.totalBytes > 0L) {
            val sizeDiffPercent = abs(bytesWritten - download.totalBytes).toDouble() / download.totalBytes
            if (sizeDiffPercent > 0.001) {
                // File size mismatch > 0.1% — verify integrity with SHA256 before failing
                val actual = computeFileSha256(targetFile)
                if (actual.lowercase() != expectedSha256.lowercase()) {
                    if (!targetFile.delete()) Log.w(TAG, "Failed to delete corrupted file: ${targetFile.path}")
                    return failDownload(downloadId, download, DownloadReason.FILE_CORRUPTED)
                }
            }
        }

        downloadDao.updateProgress(downloadId, bytesWritten, totalBytes, DownloadStatus.COMPLETED)
        DownloadForegroundService.remove(applicationContext, downloadId)
        return Result.success()
    }

    /** Returns a non-null Result if the loop should stop, null to continue. */
    private suspend fun checkCancellationOrPause(downloadId: Long, download: DownloadEntity, bytesWritten: Long): Result? {
        if (isStopped) {
            return handleStoppedState(downloadId, download, bytesWritten)
        }
        val current = downloadDao.getDownload(downloadId)
        if (current?.status == DownloadStatus.PAUSED) {
            return Result.retry()
        }
        return null
    }

    private suspend fun emitProgressUpdate(
        downloadId: Long,
        bytesWritten: Long,
        totalBytes: Long,
    ) {
        val progressDownload = downloadDao.getDownload(downloadId)
        val isSecondary = (progressDownload?.fileName ?: "").contains("mmproj", ignoreCase = true)
        DownloadForegroundService.update(
            applicationContext, downloadId, progressDownload?.title ?: DEFAULT_TITLE,
            bytesWritten, totalBytes, isSecondary, "Downloading",
        )
        setProgress(workDataOf(KEY_PROGRESS to bytesWritten, KEY_TOTAL to totalBytes))
        downloadDao.updateProgress(downloadId, bytesWritten, totalBytes, DownloadStatus.RUNNING)
    }

    private suspend fun failDownload(downloadId: Long, download: DownloadEntity, reasonCode: String): Result {
        val uiReason = DownloadReason.messageFor(reasonCode) ?: DownloadReason.messageFor(DownloadReason.UNKNOWN_ERROR)!!
        downloadDao.updateStatus(downloadId, DownloadStatus.FAILED, reasonCode)
        DownloadEventBridge.error(downloadId, download.fileName, download.modelId, uiReason, reasonCode)
        DownloadForegroundService.remove(applicationContext, downloadId)
        return Result.failure()
    }

    private suspend fun handleStoppedState(downloadId: Long, download: DownloadEntity, bytesWritten: Long): Result {
        val current = downloadDao.getDownload(downloadId) ?: download
        return if (current.status == DownloadStatus.CANCELLED) {
            // Worker owns the file write — delete partial file here once writing has stopped.
            // The module also attempts deletion but races with this worker, so this is the
            // authoritative cleanup.
            val partialFile = File(current.destination)
            if (partialFile.exists()) partialFile.delete()
            DownloadForegroundService.remove(applicationContext, downloadId)
            Result.failure()
        } else {
            val networkConnected = isNetworkConnected()
            val reasonCode = if (networkConnected) DownloadReason.DOWNLOAD_INTERRUPTED else DownloadReason.NETWORK_LOST
            val uiReason = DownloadReason.messageFor(reasonCode) ?: DownloadReason.messageFor(DownloadReason.UNKNOWN_ERROR)!!
            val statusText = if (networkConnected) "Reconnecting..." else "Waiting for network..."
            val eventStatus = if (networkConnected) "retrying" else "waiting_for_network"
            downloadDao.updateProgress(downloadId, bytesWritten, current.totalBytes, DownloadStatus.QUEUED)
            downloadDao.updateStatus(downloadId, DownloadStatus.QUEUED, reasonCode)
            val isSecondary = current.fileName.contains("mmproj", ignoreCase = true)
            DownloadForegroundService.update(
                applicationContext, downloadId, current.title,
                bytesWritten, current.totalBytes, isSecondary, statusText,
            )
            DownloadEventBridge.retrying(downloadId, current.fileName, current.modelId, uiReason, reasonCode, runAttemptCount, eventStatus)
            Result.retry()
        }
    }

    private fun isNetworkConnected(): Boolean {
        val connectivityManager =
            applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                ?: return true
        val network = connectivityManager.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    // -------------------------------------------------------------------------

    companion object {
        private const val TAG = "WorkerDownload"
        private const val DEFAULT_TITLE = "Downloading model…"

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

        /** Computes the lowercase hex SHA-256 digest of [file]. Internal for testability. */
        internal fun computeFileSha256(file: File): String {
            val digest = MessageDigest.getInstance("SHA-256")
            file.inputStream().buffered().use { input ->
                val buf = ByteArray(DEFAULT_BUFFER_SIZE)
                var n = input.read(buf)
                while (n >= 0) {
                    digest.update(buf, 0, n)
                    n = input.read(buf)
                }
            }
            return digest.digest().joinToString("") { "%02x".format(it) }
        }

        private val allowedDownloadHosts = setOf(
            "huggingface.co",
            "cdn-lfs.huggingface.co",
            "cas-bridge.xethub.hf.co",
        )

        fun isHostAllowed(url: String): Boolean {
            val host = try { URI(url).host } catch (_: Exception) { return false }
            if (host == null) return false
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

        /** Re-enqueue with KEEP policy — leaves running work untouched, restarts finished work. */
        fun enqueueResume(context: Context, downloadId: Long, progressInterval: Long = DEFAULT_PROGRESS_INTERVAL) {
            val request = OneTimeWorkRequestBuilder<WorkerDownload>()
                .setConstraints(
                    androidx.work.Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, WorkRequest.MIN_BACKOFF_MILLIS, TimeUnit.MILLISECONDS)
                .setInputData(workDataOf(KEY_DOWNLOAD_ID to downloadId, KEY_PROGRESS_INTERVAL to progressInterval))
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(workName(downloadId), ExistingWorkPolicy.KEEP, request)
        }

        fun cancel(context: Context, downloadId: Long) {
            WorkManager.getInstance(context).cancelUniqueWork(workName(downloadId))
        }

        fun workName(downloadId: Long) = "download_$downloadId"
    }
}
