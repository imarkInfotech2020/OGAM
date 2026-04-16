package ai.offgridmobile.download

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Foreground service that keeps model downloads running at high priority.
 *
 * Without a foreground service, Android's DownloadManager can silently pause
 * large downloads when the app is backgrounded or during doze/battery-saver.
 * Starting this service tells the OS the download is user-initiated and important.
 *
 * For vision models (GGUF + mmproj), passes secondary file progress to show
 * combined progress in the notification.
 */
class DownloadForegroundService : Service() {

    companion object {
        private const val CHANNEL_ID = "offgrid_download_channel"
        private const val NOTIFICATION_ID = 9001
        private const val EXTRA_TITLE = "title"
        private const val EXTRA_DOWNLOAD_ID = "download_id"
        private const val EXTRA_BYTES_DOWNLOADED = "bytes_downloaded"
        private const val EXTRA_TOTAL_BYTES = "total_bytes"
        private const val EXTRA_STATUS_TEXT = "status_text"
        // Secondary file (mmproj) progress for vision models
        private const val EXTRA_SECONDARY_BYTES = "secondary_bytes"
        private const val EXTRA_SECONDARY_TOTAL = "secondary_total"
        private const val EXTRA_IS_SECONDARY = "is_secondary"
        private const val DEFAULT_TITLE = "Downloading model…"
        private const val PROGRESS_MAX = 100

        fun start(
            context: Context,
            title: String = DEFAULT_TITLE,
            downloadId: Long = -1L,
            bytesDownloaded: Long = 0L,
            totalBytes: Long = 0L,
            statusText: String = "Downloading",
            fileName: String = "",
            secondaryBytes: Long = 0L,
            secondaryTotal: Long = 0L,
            isSecondary: Boolean = false,
        ) {
            val intent = Intent(context, DownloadForegroundService::class.java).apply {
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_DOWNLOAD_ID, downloadId)
                putExtra(EXTRA_BYTES_DOWNLOADED, bytesDownloaded)
                putExtra(EXTRA_TOTAL_BYTES, totalBytes)
                putExtra(EXTRA_STATUS_TEXT, statusText)
                putExtra("file_name", fileName)
                putExtra(EXTRA_SECONDARY_BYTES, secondaryBytes)
                putExtra(EXTRA_SECONDARY_TOTAL, secondaryTotal)
                putExtra(EXTRA_IS_SECONDARY, isSecondary)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context, reason: String = "unknown") {
            android.util.Log.d("DownloadService", "stopForeground() called - reason: $reason")
            context.stopService(Intent(context, DownloadForegroundService::class.java))
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val title = intent?.getStringExtra(EXTRA_TITLE) ?: DEFAULT_TITLE
        val downloadId = intent?.getLongExtra(EXTRA_DOWNLOAD_ID, -1L) ?: -1L
        val bytesDownloaded = intent?.getLongExtra(EXTRA_BYTES_DOWNLOADED, 0L) ?: 0L
        val totalBytes = intent?.getLongExtra(EXTRA_TOTAL_BYTES, 0L) ?: 0L
        val statusText = intent?.getStringExtra(EXTRA_STATUS_TEXT) ?: "Downloading"
        val fileName = intent?.getStringExtra("file_name") ?: ""
        val secondaryBytes = intent?.getLongExtra(EXTRA_SECONDARY_BYTES, 0L) ?: 0L
        val secondaryTotal = intent?.getLongExtra(EXTRA_SECONDARY_TOTAL, 0L) ?: 0L
        val isSecondary = intent?.getBooleanExtra(EXTRA_IS_SECONDARY, false) ?: false

        android.util.Log.d("DownloadService", "startForeground() called - file: $fileName, main: ${bytesDownloaded}/${totalBytes}, secondary: ${secondaryBytes}/${secondaryTotal}, isSecondary: $isSecondary")

        // Only update notification title if this is the main (not secondary/mmproj) download
        // Secondary downloads update progress but shouldn't change the title
        val displayTitle = if (!isSecondary && fileName.isNotEmpty()) "$fileName" else title
        val notification = buildNotification(displayTitle, statusText, bytesDownloaded, totalBytes, secondaryBytes, secondaryTotal)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        android.util.Log.d("DownloadService", "Foreground notification posted successfully")

        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        android.util.Log.d("DownloadService", "Service destroyed")
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Model Downloads",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Keeps model downloads running in the background"
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(
        title: String,
        statusText: String,
        bytesDownloaded: Long,
        totalBytes: Long,
        secondaryBytes: Long,
        secondaryTotal: Long,
    ): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val contentIntent = launchIntent?.let {
            PendingIntent.getActivity(
                this,
                0,
                it,
                PendingIntent.FLAG_UPDATE_CURRENT or if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0,
            )
        }

        // Build content text showing both files if secondary present
        val contentText = buildContentText(statusText, bytesDownloaded, totalBytes, secondaryBytes, secondaryTotal)

        // Calculate combined progress
        val combinedDownloaded = bytesDownloaded + secondaryBytes
        val combinedTotal = if (secondaryTotal > 0L) (totalBytes + secondaryTotal) else totalBytes

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(contentText)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOnlyAlertOnce(true)
            .setProgress(
                PROGRESS_MAX,
                if (combinedTotal > 0L) (combinedDownloaded * PROGRESS_MAX / combinedTotal).toInt() else 0,
                combinedTotal <= 0L,
            )
            .setContentIntent(contentIntent)
            .build()
    }

    private fun buildContentText(
        statusText: String,
        bytesDownloaded: Long,
        totalBytes: Long,
        secondaryBytes: Long,
        secondaryTotal: Long,
    ): String {
        // Vision model with two files - show breakdown
        if (secondaryTotal > 0L) {
            val mainPct = if (totalBytes > 0L) (bytesDownloaded * 100 / totalBytes).toInt() else 0
            val secondaryPct = if (secondaryTotal > 0L) (secondaryBytes * 100 / secondaryTotal).toInt() else 0
            return "GGUF: $mainPct% • mmproj: ${secondaryPct}% (${formatMb(bytesDownloaded + secondaryBytes)} / ${formatMb(totalBytes + secondaryTotal)})"
        }
        // Single file with percentage
        val pct = if (totalBytes > 0L) (bytesDownloaded * 100 / totalBytes).toInt() else 0
        return if (totalBytes > 0L) {
            "$pct% • ${formatMb(bytesDownloaded)} / ${formatMb(totalBytes)}"
        } else {
            statusText
        }
    }

    private fun formatMb(bytes: Long): String {
        return if (bytes >= 1024 * 1024 * 1024) {
            "${bytes / 1024 / 1024 / 1024.0}GB"
        } else {
            "${bytes / 1024 / 1024}MB"
        }
    }
}