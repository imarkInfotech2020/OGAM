package ai.offgridmobile.download

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
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
 * Usage: start via [start] when a download begins, stop via [stop] when all
 * downloads finish (or are cancelled).
 */
class DownloadForegroundService : Service() {

    companion object {
        private const val CHANNEL_ID = "offgrid_download_channel"
        private const val NOTIFICATION_ID = 9001
        private const val EXTRA_TITLE = "title"
        private const val EXTRA_DOWNLOAD_ID = "download_id"
        private const val DEFAULT_TITLE = "Downloading model\u2026"

        fun start(context: Context, title: String = DEFAULT_TITLE, downloadId: Long = -1L) {
            val intent = Intent(context, DownloadForegroundService::class.java).apply {
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_DOWNLOAD_ID, downloadId)
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

        android.util.Log.d("DownloadService", "startForeground() called - downloadId: $downloadId")

        val notification = buildNotification(title)

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

    private fun buildNotification(title: String): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText("Download in progress")
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
}
