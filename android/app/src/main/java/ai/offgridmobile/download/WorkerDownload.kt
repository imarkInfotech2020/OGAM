package ai.offgridmobile.download

import android.content.Context
import android.util.Log
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
        val downloadId = inputData.getString(KEY_DOWNLOAD_ID) ?: return Result.failure()
        val progressInterval = inputData.getLong(KEY_PROGRESS_INTERVAL, DEFAULT_PROGRESS_INTERVAL)
        val download = downloadDao.getDownload(downloadId) ?: return Result.failure()

        if (isStopped) return handleStoppedState(downloadId, download, 0L)

        val targetFile = File(download.destination)
        targetFile.parentFile?.mkdirs()

        syncFileSizeWithDb(downloadId, targetFile, download)

        val existingBytes = if (targetFile.exists()) targetFile.length() else 0L

        val diskCheckResult = checkDiskSpace(downloadId, download, targetFile, existingBytes)
        if (diskCheckResult != null) return diskCheckResult

        downloadDao.updateStatus(downloadId, DownloadStatus.RUNNING)

        val call = client.newCall(buildRequest(download.url, existingBytes))
        val cancelHandle = coroutineContext[Job]?.invokeOnCompletion { call.cancel() }
        return try {
            call.execute().use { response ->
                handleResponse(response, existingBytes, download, downloadId, targetFile, progressInterval)
            }
        } catch (e: Exception) {
            handleDownloadException(downloadId, download)
        } finally {
            cancelHandle?.dispose()
        }
    }

    private suspend fun checkDiskSpace(downloadId: String, download: DownloadEntity, targetFile: File, existingBytes: Long): Result? {
        if (download.totalBytes <= 0L) return null
        val needed = download.totalBytes - existingBytes
        val available = StatFs(targetFile.parentFile?.absolutePath ?: download.destination).availableBytes
        if (available < needed) {
            return failDownload(downloadId, download, DownloadReason.DISK_FULL)
        }
        return null
    }

    // Network exception during download — retry silently (maxAttempts=2), no JS state change.
    private suspend fun handleDownloadException(downloadId: String, download: DownloadEntity): Result {
        if (isStopped) return handleStoppedState(downloadId, download, download.downloadedBytes)
        downloadDao.updateStatus(downloadId, DownloadStatus.QUEUED)
        return Result.retry()
    }

    private data class StreamParams(
        val input: java.io.InputStream,
        val targetFile: File,
        val code: Int,
        val download: DownloadEntity,
        val downloadId: String,
        val currentFileBytes: Long,
        val totalBytes: Long,
        val progressInterval: Long,
    )

    private suspend fun syncFileSizeWithDb(downloadId: String, targetFile: File, download: DownloadEntity) {
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
        downloadId: String,
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

    private suspend fun handleResponseCode(
        response: Response,
        code: Int,
        existingBytes: Long,
        download: DownloadEntity,
        downloadId: String,
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
                if (code in 500..599) {
                    // Transient server error — retry silently, no JS state change.
                    downloadDao.updateStatus(downloadId, DownloadStatus.QUEUED)
                    Result.retry()
                } else {
                    // 4xx client error — permanent failure.
                    failDownload(downloadId, download, reasonCode)
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

        FileOutputStream(targetFile, appendMode).buffered().use { output ->
            input.use { src ->
                val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                var read = src.read(buffer)
                while (read >= 0) {
                    if (isStopped) return handleStoppedState(downloadId, download, bytesWritten)

                    output.write(buffer, 0, read)
                    bytesWritten += read

                    val now = System.currentTimeMillis()
                    if (now - lastProgressAt >= progressInterval) {
                        emitProgressUpdate(downloadId, bytesWritten, totalBytes)
                        lastProgressAt = now
                    }
                    read = src.read(buffer)
                }
            }
        }

        val expectedSha256 = download.expectedSha256
        if (!expectedSha256.isNullOrEmpty() && download.totalBytes > 0L) {
            val sizeDiffPercent = abs(bytesWritten - download.totalBytes).toDouble() / download.totalBytes
            if (sizeDiffPercent > 0.001) {
                val actual = computeFileSha256(targetFile)
                if (actual.lowercase() != expectedSha256.lowercase()) {
                    if (!targetFile.delete()) Log.w(TAG, "Failed to delete corrupted file: ${targetFile.path}")
                    return failDownload(downloadId, download, DownloadReason.FILE_CORRUPTED)
                }
            }
        }

        downloadDao.updateProgress(downloadId, bytesWritten, totalBytes, DownloadStatus.COMPLETED)
        return Result.success()
    }

    private suspend fun emitProgressUpdate(downloadId: String, bytesWritten: Long, totalBytes: Long) {
        setProgress(workDataOf(KEY_PROGRESS to bytesWritten, KEY_TOTAL to totalBytes))
        downloadDao.updateProgress(downloadId, bytesWritten, totalBytes, DownloadStatus.RUNNING)
    }

    private suspend fun failDownload(downloadId: String, download: DownloadEntity, reasonCode: String): Result {
        val uiReason = DownloadReason.messageFor(reasonCode) ?: DownloadReason.messageFor(DownloadReason.UNKNOWN_ERROR)!!
        downloadDao.updateStatus(downloadId, DownloadStatus.FAILED, reasonCode)
        DownloadEventBridge.error(downloadId, download.fileName, download.modelId, uiReason, reasonCode)
        return Result.failure()
    }

    private suspend fun handleStoppedState(downloadId: String, download: DownloadEntity, bytesWritten: Long): Result {
        val current = downloadDao.getDownload(downloadId) ?: download
        return if (current.status == DownloadStatus.CANCELLED) {
            val partialFile = File(current.destination)
            if (partialFile.exists()) partialFile.delete()
            Result.failure()
        } else {
            // System stopped the worker — retry silently, no JS state change.
            downloadDao.updateProgress(downloadId, bytesWritten, current.totalBytes, DownloadStatus.QUEUED)
            Result.retry()
        }
    }

    companion object {
        private const val TAG = "WorkerDownload"

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
            downloadId: String,
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

        fun cancel(context: Context, downloadId: String) {
            WorkManager.getInstance(context).cancelUniqueWork(workName(downloadId))
        }

        fun workName(downloadId: String) = "download_$downloadId"
    }
}
