package ai.offgridmobile.download

import android.content.Context
import android.net.Uri
import android.os.Environment
import androidx.work.BackoffPolicy
import androidx.work.Constraints
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
import java.util.concurrent.TimeUnit
import kotlin.math.max

class WorkerDownload(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    private val client = OkHttpClient.Builder()
        .retryOnConnectionFailure(true)
        .followRedirects(true)
        .followSslRedirects(true)
        .build()

    override suspend fun doWork(): Result {
        val downloadId = inputData.getLong(KEY_DOWNLOAD_ID, -1L)
        val url = inputData.getString(KEY_URL) ?: return Result.failure()
        val fileName = inputData.getString(KEY_FILE_NAME) ?: return Result.failure()
        val modelId = inputData.getString(KEY_MODEL_ID) ?: ""
        val title = inputData.getString(KEY_TITLE) ?: fileName
        val expectedTotalBytes = inputData.getLong(KEY_TOTAL_BYTES, 0L)
        val targetFile = File(
            applicationContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
            fileName
        )
        val tempDir = targetFile.parentFile
        tempDir?.mkdirs()
        DownloadEventBridge.log(
            "I",
            "[Worker] doWork start id=$downloadId attempt=$runAttemptCount file=$fileName model=$modelId"
        )
        DownloadForegroundService.start(applicationContext, title, downloadId)
        WorkerDownloadStore.update(applicationContext, downloadId) {
            it.put("status", WorkerDownloadStore.STATUS_RUNNING)
            it.put("localUri", Uri.fromFile(targetFile).toString())
        }

        try {
            val existingBytes = if (targetFile.exists()) targetFile.length() else 0L
            val requestBuilder = Request.Builder().url(url)
            if (existingBytes > 0L) {
                requestBuilder.addHeader("Range", "bytes=$existingBytes-")
            }

            val request = requestBuilder.build()

            client.newCall(request).execute().use { response ->
                val code = response.code
                DownloadEventBridge.log("I", "[Worker] Response id=$downloadId code=$code")
                if (existingBytes > 0L && code == 200) {
                    DownloadEventBridge.log("W", "[Worker] Server ignored range for id=$downloadId, restarting from zero")
                    targetFile.delete()
                } else if (code == 416) {
                    DownloadEventBridge.log("E", "[Worker] Range invalid for id=$downloadId, deleting partial file")
                    targetFile.delete()
                    val reason = "Server rejected resume request (416)"
                    fail(downloadId, fileName, modelId, reason)
                    return Result.failure()
                } else if (!response.isSuccessful) {
                    val reason = "HTTP ${response.code}"
                    DownloadEventBridge.log("E", "[Worker] Request failed id=$downloadId reason=$reason")
                    fail(downloadId, fileName, modelId, reason)
                    return if (response.code in 500..599) Result.retry() else Result.failure()
                }

                val body = response.body ?: run {
                    val reason = "Empty response body"
                    DownloadEventBridge.log("E", "[Worker] No response body id=$downloadId")
                    fail(downloadId, fileName, modelId, reason)
                    return Result.failure()
                }

                val currentFileBytes = if (targetFile.exists() && response.code == 206) targetFile.length() else 0L
                val contentLength = body.contentLength()
                val totalBytes = when (response.code) {
                    206 -> currentFileBytes + contentLength
                    200 -> contentLength
                    else -> maxOf(expectedTotalBytes, contentLength)
                }.coerceAtLeast(expectedTotalBytes)
                DownloadEventBridge.log("I", "[Worker] Transfer plan id=$downloadId existing=$currentFileBytes body=$contentLength total=$totalBytes")

                var bytesWritten = currentFileBytes
                var lastProgressAt = 0L
                val appendMode = targetFile.exists() && response.code == 206
                FileOutputStream(targetFile, appendMode).buffered().use { output ->
                    body.byteStream().buffered().use { input ->
                        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                        var read = input.read(buffer)
                        while (read >= 0) {
                            if (isStopped) {
                                val reason = "Worker stopped"
                                DownloadEventBridge.log("W", "[Worker] Stopped mid-transfer id=$downloadId bytes=$bytesWritten")
                                fail(downloadId, fileName, modelId, reason, WorkerDownloadStore.STATUS_CANCELLED)
                                return Result.failure()
                            }
                            output.write(buffer, 0, read)
                            bytesWritten += read
                            val now = System.currentTimeMillis()
                            if (now - lastProgressAt >= PROGRESS_INTERVAL_MS) {
                                persistProgress(downloadId, bytesWritten, totalBytes)
                                DownloadEventBridge.progress(downloadId, fileName, modelId, bytesWritten, totalBytes, WorkerDownloadStore.STATUS_RUNNING)
                                lastProgressAt = now
                                setProgress(workDataOf(KEY_PROGRESS to bytesWritten, KEY_TOTAL_BYTES to totalBytes))
                            }
                            read = input.read(buffer)
                        }
                    }
                }

                persistProgress(downloadId, bytesWritten, totalBytes)
                WorkerDownloadStore.update(applicationContext, downloadId) {
                    it.put("status", WorkerDownloadStore.STATUS_COMPLETED)
                    it.put("bytesDownloaded", bytesWritten)
                    it.put("totalBytes", totalBytes)
                    it.put("completedAt", System.currentTimeMillis())
                    it.put("localUri", Uri.fromFile(targetFile).toString())
                }
                DownloadEventBridge.complete(
                    downloadId,
                    fileName,
                    modelId,
                    Uri.fromFile(targetFile).toString(),
                    bytesWritten,
                    totalBytes,
                )
                DownloadEventBridge.log("I", "[Worker] Completed id=$downloadId bytes=$bytesWritten")
                WorkerDownloadStore.stopForegroundServiceIfIdle(applicationContext, "worker completed")
                return Result.success()
            }
        } catch (e: Exception) {
            val reason = e.message ?: e.javaClass.simpleName
            DownloadEventBridge.log(
                "E",
                "[Worker] Exception id=$downloadId attempt=$runAttemptCount reason=$reason"
            )
            fail(downloadId, fileName, modelId, reason)
            return Result.retry()
        }
    }

    private fun persistProgress(downloadId: Long, bytesWritten: Long, totalBytes: Long) {
        WorkerDownloadStore.update(applicationContext, downloadId) {
            it.put("status", WorkerDownloadStore.STATUS_RUNNING)
            it.put("bytesDownloaded", bytesWritten)
            it.put("totalBytes", totalBytes)
            it.put("updatedAt", System.currentTimeMillis())
        }
    }

    private fun fail(downloadId: Long, fileName: String, modelId: String, reason: String, status: String = WorkerDownloadStore.STATUS_FAILED) {
        WorkerDownloadStore.update(applicationContext, downloadId) {
            it.put("status", status)
            it.put("reason", reason)
            it.put("updatedAt", System.currentTimeMillis())
        }
        DownloadEventBridge.error(downloadId, fileName, modelId, reason, status)
        WorkerDownloadStore.stopForegroundServiceIfIdle(applicationContext, "worker terminal status=$status")
    }

    companion object {
        private const val PROGRESS_INTERVAL_MS = 750L
        const val KEY_DOWNLOAD_ID = "download_id"
        const val KEY_URL = "url"
        const val KEY_FILE_NAME = "file_name"
        const val KEY_MODEL_ID = "model_id"
        const val KEY_TITLE = "title"
        const val KEY_TOTAL_BYTES = "total_bytes"
        const val KEY_PROGRESS = "progress"

        fun enqueue(
            context: Context,
            downloadId: Long,
            url: String,
            fileName: String,
            modelId: String,
            title: String,
            totalBytes: Long,
        ): OneTimeWorkRequest {
            val request = OneTimeWorkRequestBuilder<WorkerDownload>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    WorkRequest.MIN_BACKOFF_MILLIS,
                    TimeUnit.MILLISECONDS
                )
                .setInputData(
                    workDataOf(
                        KEY_DOWNLOAD_ID to downloadId,
                        KEY_URL to url,
                        KEY_FILE_NAME to fileName,
                        KEY_MODEL_ID to modelId,
                        KEY_TITLE to title,
                        KEY_TOTAL_BYTES to totalBytes,
                    )
                )
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                "worker_download_$downloadId",
                ExistingWorkPolicy.REPLACE,
                request
            )
            return request
        }

        fun cancel(context: Context, downloadId: Long) {
            WorkManager.getInstance(context).cancelUniqueWork("worker_download_$downloadId")
        }
    }
}
