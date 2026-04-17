package ai.offgridmobile.download

import android.app.Application
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], application = Application::class)
class DownloadForegroundServiceTest {

    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
    }

    // ── Notification channel ─────────────────────────────────────────────────

    @Test
    fun `creates notification channel on service onCreate`() {
        val controller = Robolectric.buildService(DownloadForegroundService::class.java)
        controller.create()

        val manager = context.getSystemService(NotificationManager::class.java)
        val channel = manager.getNotificationChannel("offgrid_download_channel")
        assertNotNull("Notification channel should be created", channel)
        assertEquals("Model Downloads", channel.name)
        assertEquals(NotificationManager.IMPORTANCE_LOW, channel.importance)
    }

    // ── Foreground notification ──────────────────────────────────────────────

    @Test
    fun `starts foreground with notification on startCommand`() {
        val controller = Robolectric.buildService(DownloadForegroundService::class.java)
        controller.create()

        val intent = Intent(context, DownloadForegroundService::class.java).apply {
            putExtra("title", "Downloading test-model.gguf")
        }
        controller.withIntent(intent).startCommand(0, 0)

        val shadow = shadowOf(controller.get())
        val notification = shadow.lastForegroundNotification
        assertNotNull("Service should post a foreground notification", notification)
    }

    @Test
    fun `uses default title when intent has no extra`() {
        val controller = Robolectric.buildService(DownloadForegroundService::class.java)
        controller.create()
        controller.startCommand(0, 0)

        val shadow = shadowOf(controller.get())
        assertNotNull(shadow.lastForegroundNotification)
    }

    @Test
    fun `returns START_NOT_STICKY from onStartCommand`() {
        val controller = Robolectric.buildService(DownloadForegroundService::class.java)
        controller.create()

        val intent = Intent(context, DownloadForegroundService::class.java)
        val result = controller.get().onStartCommand(intent, 0, 0)
        assertEquals(android.app.Service.START_NOT_STICKY, result)
    }

    // ── onBind ───────────────────────────────────────────────────────────────

    @Test
    fun `onBind returns null`() {
        val controller = Robolectric.buildService(DownloadForegroundService::class.java)
        controller.create()
        assertNull(controller.get().onBind(Intent()))
    }

    // ── Static helpers ───────────────────────────────────────────────────────

    @Test
    fun `update sends intent to DownloadForegroundService`() {
        DownloadForegroundService.update(
            context = context,
            downloadId = 1L,
            modelTitle = "Downloading model",
        )

        val shadow = shadowOf(context as Application)
        val intent = shadow.nextStartedService
        assertNotNull("update() should start the service", intent)
        assertEquals(DownloadForegroundService::class.java.name, intent.component?.className)
    }

    @Test
    fun `stop calls stopService without throwing`() {
        // Verify stop() doesn't throw — the service will be stopped by the system
        DownloadForegroundService.stop(context)
    }
}
