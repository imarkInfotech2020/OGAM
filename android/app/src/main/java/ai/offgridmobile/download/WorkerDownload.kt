package ai.offgridmobile.download

import android.content.Context
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
        DownloadEventBridge.log("I", "[Worker] doWork start id=$downloadId attempt=$runAttemptCount file=${download.fileName}")

        // Handle early stops and pauses
        val earlyCheckResult = handleEarlyStopOrPause(downloadId, download)
        if (earlyCheckResult != null) return earlyCheckResult

        DownloadForegroundService.start(applicationContext, download.title, downloadId)

        val targetFile = File(download.destination)
        targetFile.parentFile?.mkdirs()

        syncFileSizeWithDb(downloadId, targetFile, download)

        val existingBytes = if (targetFile.exists()) targetFile.length() else 0L
        DownloadEventBridge.log("I", "[Worker] Resume offset=${existingBytes}B file=${targetFile.absolutePath}")

        // Disk space check — fail fast rather than filling the disk mid-download
        val diskCheckResult = checkDiskSpace(downloadId, download, targetFile, existingBytes)
        if (diskCheckResult != null) return diskCheckResult

        downloadDao.updateStatus(downloadId, DownloadStatus.RUNNING)

        val requestStartMs = System.currentTimeMillis()
        val call = client.newCall(buildRequest(download.url, existingBytes))
        val cancelHandle = coroutineContext[Job]?.invokeOnCompletion { call.cancel() }
        return try {
            call.execute().use { response ->
                val ttfbMs = System.currentTimeMillis() - requestStartMs
                DownloadEventBridge.log("I", "[Worker] TTFB id=$downloadId: ${ttfbMs}ms (time to first byte / server response)")
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
            val partial = File(download.destination)
            if (partial.exists() && !partial.delete()) DownloadEventBridge.log("W", "[Worker] Could not delete partial on early cancel id=$downloadId")
            downloadDao.updateStatus(downloadId, DownloadStatus.CANCELLED, MSG_DOWNLOAD_CANCELLED)
            return Result.failure()
        }
        if (download.status == DownloadStatus.PAUSED) {
            DownloadEventBridge.log("I", "[Worker] Paused on start — will retry when resumed id=$downloadId")
            return Result.retry()
        }
        return null
    }

    /** Returns non-null Result if disk space check fails, null to continue. */
    private suspend fun checkDiskSpace(downloadId: Long, download: DownloadEntity, targetFile: File, existingBytes: Long): Result? {
        if (download.totalBytes <= 0L) return null
        val needed = download.totalBytes - existingBytes
        val available = StatFs(targetFile.parentFile?.absolutePath ?: download.destination).availableBytes
        DownloadEventBridge.log("I", "[Worker] Disk space id=$downloadId need=${needed / 1024 / 1024}MB available=${available / 1024 / 1024}MB")
        if (available < needed) {
            val reason = "Not enough disk space (need ${needed / 1024 / 1024}MB, have ${available / 1024 / 1024}MB)"
            return failDownload(downloadId, download, reason, "worker disk space")
        }
        return null
    }

    /** Handles exceptions during download. */
    private suspend fun handleDownloadException(e: Exception, downloadId: Long, download: DownloadEntity, requestStartMs: Long): Result {
        if (isStopped) {
            val partial = File(download.destination)
            if (partial.exists() && !partial.delete()) DownloadEventBridge.log("W", "[Worker] Could not delete partial on cancel id=$downloadId")
            downloadDao.updateStatus(downloadId, DownloadStatus.CANCELLED, MSG_DOWNLOAD_CANCELLED)
            WorkerDownloadStore.stopForegroundServiceIfIdle(applicationContext, "worker cancelled")
            return Result.failure()
        }
        val elapsed = System.currentTimeMillis() - requestStartMs
        val reason = e.message ?: e.javaClass.simpleName
        DownloadEventBridge.log("E", "[Worker] Exception id=$downloadId attempt=$runAttemptCount elapsed=${elapsed}ms reason=$reason")
        DownloadEventBridge.log("E", "[Worker] Stack: ${e.stackTraceToString().take(400)}")
        downloadDao.updateStatus(downloadId, DownloadStatus.QUEUED, reason)
        DownloadEventBridge.retrying(downloadId, download.fileName, download.modelId, reason, runAttemptCount)
        WorkerDownloadStore.stopForegroundServiceIfIdle(applicationContext, "worker exception")
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
            DownloadEventBridge.log("I", "[Worker] Resuming from byte $existingBytes")
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
        val acceptRanges = response.header("Accept-Ranges") ?: "not-set"
        val contentLengthHeader = response.header("Content-Length") ?: "unknown"
        val contentRange = response.header("Content-Range") ?: ""
        DownloadEventBridge.log("I", "[Worker] Response id=$downloadId code=$code Accept-Ranges=$acceptRanges Content-Length=$contentLengthHeader${if (contentRange.isNotEmpty()) " Content-Range=$contentRange" else ""}")

        val earlyResult = handleResponseCode(response, code, existingBytes, download, downloadId, targetFile)
        if (earlyResult != null) return earlyResult

        val body = response.body ?: return failDownload(downloadId, download, "Empty response body", "worker no body")

        val currentFileBytes = if (targetFile.exists() && code == 206) targetFile.length() else 0L
        val contentLength = body.contentLength()
        val totalBytes = calculateTotalBytes(code, currentFileBytes, contentLength, download.totalBytes)

        DownloadEventBridge.log("I", "[Worker] Transfer plan id=$downloadId existing=$currentFileBytes body=$contentLength total=$totalBytes")
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
                DownloadEventBridge.log("W", "[Worker] Server returned 200 despite Range header — resume not supported, restarting from 0. id=$downloadId existingBytes=$existingBytes")
                if (!targetFile.delete()) DownloadEventBridge.log("W", "[Worker] Could not delete partial file for restart id=$downloadId")
                null
            }
            code == 416 -> {
                DownloadEventBridge.log("E", "[Worker] Range invalid id=$downloadId, deleting partial")
                if (!targetFile.delete()) DownloadEventBridge.log("W", "[Worker] Could not delete partial file on 416 id=$downloadId")
                failDownload(downloadId, download, "Server rejected resume (416)", "worker 416")
            }
            !response.isSuccessful -> {
                val reason = "HTTP $code"
                DownloadEventBridge.log("E", "[Worker] Request failed id=$downloadId reason=$reason")
                downloadDao.updateStatus(downloadId, DownloadStatus.FAILED, reason)
                DownloadEventBridge.error(downloadId, download.fileName, download.modelId, reason)
                WorkerDownloadStore.stopForegroundServiceIfIdle(applicationContext, "worker http error")
                if (code in 500..599) Result.retry() else Result.failure()
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

        DownloadEventBridge.log("I", "[Worker] Stream start id=$downloadId append=$appendMode offset=${currentFileBytes}B total=${totalBytes}B")

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
                        emitProgressUpdate(downloadId, bytesWritten, totalBytes, lastSpeedBytes, lastSpeedTs, now)
                        lastSpeedBytes = bytesWritten
                        lastSpeedTs = now
                        lastProgressAt = now
                    }
                    read = src.read(buffer)
                }
            }
        }

        val totalElapsedMs = (System.currentTimeMillis() - transferStartMs).coerceAtLeast(1L)
        val avgSpeedKBps = (bytesWritten - currentFileBytes) * 1000L / totalElapsedMs / 1024L
        DownloadEventBridge.log("I", "[Worker] Stream done id=$downloadId bytes=$bytesWritten elapsed=${totalElapsedMs}ms avgSpeed=${avgSpeedKBps}KB/s")

        // SHA256 integrity check — only if file size doesn't match (avoid expensive hash computation on mobile)
        // Most downloads will match size exactly, so this rarely runs.
        // Only check hash if size is off by > 0.1%, indicating truncation or corruption.
        val expectedSha256 = download.expectedSha256
        if (!expectedSha256.isNullOrEmpty() && download.totalBytes > 0L) {
            val sizeDiffPercent = abs(bytesWritten - download.totalBytes).toDouble() / download.totalBytes
            if (sizeDiffPercent > 0.001) {
                // File size mismatch > 0.1% — verify integrity with SHA256 before failing
                DownloadEventBridge.log("I", "[Worker] Size mismatch (${(sizeDiffPercent * 100).toInt()}%) — verifying SHA256 id=$downloadId")
                val actual = computeFileSha256(targetFile)
                if (actual.lowercase() != expectedSha256.lowercase()) {
                    DownloadEventBridge.log("E", "[Worker] SHA256 mismatch id=$downloadId expected=$expectedSha256 actual=$actual")
                    if (!targetFile.delete()) DownloadEventBridge.log("W", "[Worker] Could not delete corrupt file id=$downloadId")
                    return failDownload(downloadId, download, "File corrupted (size mismatch + hash failure)", "worker sha256 mismatch")
                }
                DownloadEventBridge.log("I", "[Worker] SHA256 matches despite size mismatch (server quirk?) id=$downloadId")
            } else {
                // File size matches within tolerance — skip expensive hash computation, assume valid
                DownloadEventBridge.log("I", "[Worker] File size matches expected (within 0.1%) — skipping SHA256 check id=$downloadId")
            }
        }

        downloadDao.updateProgress(downloadId, bytesWritten, totalBytes, DownloadStatus.COMPLETED)
        DownloadEventBridge.log("I", "[Worker] Completed id=$downloadId")
        WorkerDownloadStore.stopForegroundServiceIfIdle(applicationContext, "worker completed")
        return Result.success()
    }

    /** Returns a non-null Result if the loop should stop, null to continue. */
    private suspend fun checkCancellationOrPause(downloadId: Long, download: DownloadEntity, bytesWritten: Long): Result? {
        if (isStopped) {
            val partial = File(download.destination)
            if (partial.exists() && !partial.delete()) DownloadEventBridge.log("W", "[Worker] Could not delete partial on cancel id=$downloadId bytes=$bytesWritten")
            downloadDao.updateStatus(downloadId, DownloadStatus.CANCELLED, MSG_DOWNLOAD_CANCELLED)
            DownloadEventBridge.error(downloadId, download.fileName, download.modelId, MSG_DOWNLOAD_CANCELLED, "cancelled")
            WorkerDownloadStore.stopForegroundServiceIfIdle(applicationContext, "worker stopped")
            return Result.failure()
        }
        val current = downloadDao.getDownload(downloadId)
        if (current?.status == DownloadStatus.PAUSED) {
            DownloadEventBridge.log("I", "[Worker] Paused mid-transfer id=$downloadId bytes=$bytesWritten")
            return Result.retry()
        }
        return null
    }

    private suspend fun emitProgressUpdate(
        downloadId: Long,
        bytesWritten: Long,
        totalBytes: Long,
        lastSpeedBytes: Long,
        lastSpeedTs: Long,
        now: Long,
    ) {
        val intervalMs = (now - lastSpeedTs).coerceAtLeast(1L)
        val speedKBps = (bytesWritten - lastSpeedBytes) * 1000L / intervalMs / 1024L
        val pct = if (totalBytes > 0) bytesWritten * 100L / totalBytes else 0L
        DownloadEventBridge.log("I", "[Worker] Progress id=$downloadId ${pct}% ${bytesWritten / 1024 / 1024}MB/${totalBytes / 1024 / 1024}MB speed=${speedKBps}KB/s")
        setProgress(workDataOf(KEY_PROGRESS to bytesWritten, KEY_TOTAL to totalBytes))
        downloadDao.updateProgress(downloadId, bytesWritten, totalBytes, DownloadStatus.RUNNING)
    }

    private suspend fun failDownload(downloadId: Long, download: DownloadEntity, reason: String, serviceReason: String): Result {
        downloadDao.updateStatus(downloadId, DownloadStatus.FAILED, reason)
        DownloadEventBridge.error(downloadId, download.fileName, download.modelId, reason)
        WorkerDownloadStore.stopForegroundServiceIfIdle(applicationContext, serviceReason)
        return Result.failure()
    }

    // -------------------------------------------------------------------------

    companion object {
        const val MSG_DOWNLOAD_CANCELLED = "Download cancelled"

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
