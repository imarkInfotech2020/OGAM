package ai.offgridmobile.download

import android.app.DownloadManager
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Tests for the pure status/reason mapping functions in DownloadManagerModule.
 * These functions contain complex branching logic and all branches must be covered.
 */
@RunWith(JUnit4::class)
class DownloadManagerModuleTest {

    // ── statusToString ────────────────────────────────────────────────────────

    @Test
    fun `statusToString maps STATUS_PENDING to pending`() {
        assertEquals("pending", DownloadManagerModule.statusToString(DownloadManager.STATUS_PENDING))
    }

    @Test
    fun `statusToString maps STATUS_RUNNING to running`() {
        assertEquals("running", DownloadManagerModule.statusToString(DownloadManager.STATUS_RUNNING))
    }

    @Test
    fun `statusToString maps STATUS_PAUSED to paused`() {
        assertEquals("paused", DownloadManagerModule.statusToString(DownloadManager.STATUS_PAUSED))
    }

    @Test
    fun `statusToString maps STATUS_SUCCESSFUL to completed`() {
        assertEquals("completed", DownloadManagerModule.statusToString(DownloadManager.STATUS_SUCCESSFUL))
    }

    @Test
    fun `statusToString maps STATUS_FAILED to failed`() {
        assertEquals("failed", DownloadManagerModule.statusToString(DownloadManager.STATUS_FAILED))
    }

    @Test
    fun `statusToString returns unknown for unrecognized status`() {
        assertEquals("unknown", DownloadManagerModule.statusToString(-99))
        assertEquals("unknown", DownloadManagerModule.statusToString(0))
    }

    // ── reasonToString — paused ───────────────────────────────────────────────

    @Test
    fun `reasonToString maps PAUSED_QUEUED_FOR_WIFI when status is paused`() {
        assertEquals(
            "Waiting for WiFi",
            DownloadManagerModule.reasonToString(
                DownloadManager.STATUS_PAUSED,
                DownloadManager.PAUSED_QUEUED_FOR_WIFI,
            ),
        )
    }

    @Test
    fun `reasonToString maps PAUSED_WAITING_FOR_NETWORK when status is paused`() {
        assertEquals(
            "Waiting for network",
            DownloadManagerModule.reasonToString(
                DownloadManager.STATUS_PAUSED,
                DownloadManager.PAUSED_WAITING_FOR_NETWORK,
            ),
        )
    }

    @Test
    fun `reasonToString maps PAUSED_WAITING_TO_RETRY when status is paused`() {
        assertEquals(
            "Waiting to retry",
            DownloadManagerModule.reasonToString(
                DownloadManager.STATUS_PAUSED,
                DownloadManager.PAUSED_WAITING_TO_RETRY,
            ),
        )
    }

    @Test
    fun `reasonToString returns generic Paused for unknown pause reason`() {
        assertEquals(
            "Paused",
            DownloadManagerModule.reasonToString(DownloadManager.STATUS_PAUSED, -99),
        )
    }

    // ── reasonToString — failed ───────────────────────────────────────────────

    @Test
    fun `reasonToString maps ERROR_CANNOT_RESUME when status is failed`() {
        assertEquals(
            "Cannot resume",
            DownloadManagerModule.reasonToString(
                DownloadManager.STATUS_FAILED,
                DownloadManager.ERROR_CANNOT_RESUME,
            ),
        )
    }

    @Test
    fun `reasonToString maps ERROR_DEVICE_NOT_FOUND when status is failed`() {
        assertEquals(
            "Device not found",
            DownloadManagerModule.reasonToString(
                DownloadManager.STATUS_FAILED,
                DownloadManager.ERROR_DEVICE_NOT_FOUND,
            ),
        )
    }

    @Test
    fun `reasonToString maps ERROR_FILE_ALREADY_EXISTS when status is failed`() {
        assertEquals(
            "File already exists",
            DownloadManagerModule.reasonToString(
                DownloadManager.STATUS_FAILED,
                DownloadManager.ERROR_FILE_ALREADY_EXISTS,
            ),
        )
    }

    @Test
    fun `reasonToString maps ERROR_FILE_ERROR when status is failed`() {
        assertEquals(
            "File error",
            DownloadManagerModule.reasonToString(
                DownloadManager.STATUS_FAILED,
                DownloadManager.ERROR_FILE_ERROR,
            ),
        )
    }

    @Test
    fun `reasonToString maps ERROR_HTTP_DATA_ERROR when status is failed`() {
        assertEquals(
            "HTTP data error",
            DownloadManagerModule.reasonToString(
                DownloadManager.STATUS_FAILED,
                DownloadManager.ERROR_HTTP_DATA_ERROR,
            ),
        )
    }

    @Test
    fun `reasonToString maps ERROR_INSUFFICIENT_SPACE when status is failed`() {
        assertEquals(
            "Insufficient space",
            DownloadManagerModule.reasonToString(
                DownloadManager.STATUS_FAILED,
                DownloadManager.ERROR_INSUFFICIENT_SPACE,
            ),
        )
    }

    @Test
    fun `reasonToString maps ERROR_TOO_MANY_REDIRECTS when status is failed`() {
        assertEquals(
            "Too many redirects",
            DownloadManagerModule.reasonToString(
                DownloadManager.STATUS_FAILED,
                DownloadManager.ERROR_TOO_MANY_REDIRECTS,
            ),
        )
    }

    @Test
    fun `reasonToString maps ERROR_UNHANDLED_HTTP_CODE when status is failed`() {
        assertEquals(
            "Unhandled HTTP code",
            DownloadManagerModule.reasonToString(
                DownloadManager.STATUS_FAILED,
                DownloadManager.ERROR_UNHANDLED_HTTP_CODE,
            ),
        )
    }

    @Test
    fun `reasonToString maps ERROR_UNKNOWN when status is failed`() {
        assertEquals(
            "Unknown error",
            DownloadManagerModule.reasonToString(
                DownloadManager.STATUS_FAILED,
                DownloadManager.ERROR_UNKNOWN,
            ),
        )
    }

    @Test
    fun `reasonToString includes error code for unrecognized failure reason`() {
        assertEquals(
            "Error: 999",
            DownloadManagerModule.reasonToString(DownloadManager.STATUS_FAILED, 999),
        )
    }

    // ── reasonToString — other statuses ──────────────────────────────────────

    @Test
    fun `reasonToString returns empty string when status is not paused or failed`() {
        assertEquals("", DownloadManagerModule.reasonToString(DownloadManager.STATUS_PENDING, 0))
        assertEquals("", DownloadManagerModule.reasonToString(DownloadManager.STATUS_RUNNING, 0))
        assertEquals("", DownloadManagerModule.reasonToString(DownloadManager.STATUS_SUCCESSFUL, 0))
    }
}
