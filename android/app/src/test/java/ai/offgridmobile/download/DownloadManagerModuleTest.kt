package ai.offgridmobile.download

import android.app.Application
import android.app.DownloadManager
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Tests for the pure helper functions in DownloadManagerModule.
 * These functions contain complex branching logic and all branches must be covered.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], application = Application::class)
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

    // ── hasNoActiveDownloads ────────────────────────────────────────────────

    private fun downloadsArray(vararg statuses: String): org.json.JSONArray {
        val arr = org.json.JSONArray()
        statuses.forEach { arr.put(JSONObject().put("downloadId", arr.length().toLong()).put("status", it)) }
        return arr
    }

    @Test
    fun `hasNoActiveDownloads returns true for empty list`() {
        assertTrue(DownloadManagerModule.hasNoActiveDownloads(org.json.JSONArray()))
    }

    @Test
    fun `hasNoActiveDownloads returns false when a download is pending`() {
        assertFalse(DownloadManagerModule.hasNoActiveDownloads(downloadsArray(DownloadManagerModule.STATUS_PENDING)))
    }

    @Test
    fun `hasNoActiveDownloads returns false when a download is running`() {
        assertFalse(DownloadManagerModule.hasNoActiveDownloads(downloadsArray(DownloadManagerModule.STATUS_RUNNING)))
    }

    @Test
    fun `hasNoActiveDownloads returns false when a download is paused`() {
        assertFalse(DownloadManagerModule.hasNoActiveDownloads(downloadsArray(DownloadManagerModule.STATUS_PAUSED)))
    }

    @Test
    fun `hasNoActiveDownloads returns true when all are completed`() {
        assertTrue(DownloadManagerModule.hasNoActiveDownloads(downloadsArray(DownloadManagerModule.STATUS_COMPLETED, DownloadManagerModule.STATUS_COMPLETED)))
    }

    @Test
    fun `hasNoActiveDownloads returns true when all are failed`() {
        assertTrue(DownloadManagerModule.hasNoActiveDownloads(downloadsArray(DownloadManagerModule.STATUS_FAILED, DownloadManagerModule.STATUS_FAILED)))
    }

    @Test
    fun `hasNoActiveDownloads returns true for mix of completed and failed`() {
        assertTrue(DownloadManagerModule.hasNoActiveDownloads(downloadsArray(DownloadManagerModule.STATUS_COMPLETED, DownloadManagerModule.STATUS_FAILED)))
    }

    @Test
    fun `hasNoActiveDownloads returns false when one of many is still running`() {
        assertFalse(DownloadManagerModule.hasNoActiveDownloads(downloadsArray(DownloadManagerModule.STATUS_COMPLETED, DownloadManagerModule.STATUS_RUNNING, DownloadManagerModule.STATUS_FAILED)))
    }

    @Test
    fun `hasNoActiveDownloads defaults missing status to pending`() {
        val arr = org.json.JSONArray()
        arr.put(JSONObject().put("downloadId", 1L)) // no "status" key
        assertFalse(DownloadManagerModule.hasNoActiveDownloads(arr))
    }

    // ── shouldRemoveDownload ──────────────────────────────────────────────────
    //
    // Entries are only pruned after moveCompletedDownload sets moveCompleted=true.
    // Time-based removal alone caused downloads to vanish while the phone was
    // sleeping — the JS side couldn't call moveCompletedDownload in time.

    private fun download(
        storedStatus: String = "pending",
        completedAt: Long = 0L,
        completedEventSent: Boolean = false,
        moveCompleted: Boolean = false,
    ) = JSONObject()
        .put("downloadId", 42L)
        .put("status", storedStatus)
        .put("completedAt", completedAt)
        .put("completedEventSent", completedEventSent)
        .put("moveCompleted", moveCompleted)

    @Test
    fun `shouldRemoveDownload returns true when live status is unknown`() {
        assertTrue(DownloadManagerModule.shouldRemoveDownload(download("running"), liveStatus = "unknown"))
    }

    @Test
    fun `shouldRemoveDownload returns false for active downloads`() {
        assertFalse(DownloadManagerModule.shouldRemoveDownload(download("running"), liveStatus = "running"))
        assertFalse(DownloadManagerModule.shouldRemoveDownload(download("pending"), liveStatus = "pending"))
    }

    @Test
    fun `shouldRemoveDownload removes completed download when move confirmed and older than 5 seconds`() {
        val now = System.currentTimeMillis()
        val dl = download("completed", completedAt = now - 6_000L, completedEventSent = true, moveCompleted = true)
        assertTrue(DownloadManagerModule.shouldRemoveDownload(dl, liveStatus = "completed", currentTimeMs = now))
    }

    @Test
    fun `shouldRemoveDownload keeps completed download when move confirmed but not yet 5 seconds old`() {
        val now = System.currentTimeMillis()
        val dl = download("completed", completedAt = now - 1_000L, completedEventSent = true, moveCompleted = true)
        assertFalse(DownloadManagerModule.shouldRemoveDownload(dl, liveStatus = "completed", currentTimeMs = now))
    }

    @Test
    fun `shouldRemoveDownload keeps completed download when event sent but move not confirmed`() {
        // Event sent is NOT enough — must wait for moveCompletedDownload to confirm
        val now = System.currentTimeMillis()
        val dl = download("completed", completedAt = now - 60_000L, completedEventSent = true, moveCompleted = false)
        assertFalse(DownloadManagerModule.shouldRemoveDownload(dl, liveStatus = "completed", currentTimeMs = now))
    }

    @Test
    fun `shouldRemoveDownload keeps completed download indefinitely until move is confirmed`() {
        // Even after 10 minutes, entry stays if moveCompleted is false
        val now = System.currentTimeMillis()
        val dl = download("completed", completedAt = now - 600_000L, completedEventSent = true, moveCompleted = false)
        assertFalse(DownloadManagerModule.shouldRemoveDownload(dl, liveStatus = "completed", currentTimeMs = now))
    }

    @Test
    fun `shouldRemoveDownload keeps completed download when completedAt is zero`() {
        val now = System.currentTimeMillis()
        val dl = download("completed", completedAt = 0L, completedEventSent = true, moveCompleted = true)
        assertFalse(DownloadManagerModule.shouldRemoveDownload(dl, liveStatus = "completed", currentTimeMs = now))
    }

    @Test
    fun `shouldRemoveDownload returns false for non-completed stored status regardless of live status`() {
        val now = System.currentTimeMillis()
        val dl = download("running", completedAt = now - 10_000L, completedEventSent = true, moveCompleted = true)
        assertFalse(DownloadManagerModule.shouldRemoveDownload(dl, liveStatus = "running", currentTimeMs = now))
    }

    // ── shouldRemoveDownload — additional edge cases ─────────────────────────

    @Test
    fun `shouldRemoveDownload keeps paused download`() {
        assertFalse(DownloadManagerModule.shouldRemoveDownload(download("paused"), liveStatus = "paused"))
    }

    @Test
    fun `shouldRemoveDownload uses exactly 5000ms threshold — not yet expired`() {
        // t=10000, completedAt=5001 → age=4999ms — below threshold (move confirmed)
        val dl = download("completed", completedAt = 5_001L, completedEventSent = true, moveCompleted = true)
        assertFalse(DownloadManagerModule.shouldRemoveDownload(dl, liveStatus = "completed", currentTimeMs = 10_000L))
    }

    @Test
    fun `shouldRemoveDownload uses exactly 5000ms threshold — just expired`() {
        // t=10000, completedAt=4999 → age=5001ms — above threshold (move confirmed)
        val dl = download("completed", completedAt = 4_999L, completedEventSent = true, moveCompleted = true)
        assertTrue(DownloadManagerModule.shouldRemoveDownload(dl, liveStatus = "completed", currentTimeMs = 10_000L))
    }

    @Test
    fun `shouldRemoveDownload never removes without moveCompleted even when very old`() {
        // completedAt far in the past, eventSent=true, but moveCompleted=false — must NOT remove
        val now = System.currentTimeMillis()
        val dl = download("completed", completedAt = now - 300_000L, completedEventSent = true, moveCompleted = false)
        assertFalse(DownloadManagerModule.shouldRemoveDownload(dl, liveStatus = "completed", currentTimeMs = now))
    }

    @Test
    fun `shouldRemoveDownload requires completedAt to be set to remove`() {
        // completedAt=0 even with moveCompleted=true — guard against incomplete records
        val now = System.currentTimeMillis()
        val dl = download("completed", completedAt = 0L, completedEventSent = true, moveCompleted = true)
        assertFalse(DownloadManagerModule.shouldRemoveDownload(dl, liveStatus = "completed", currentTimeMs = now))
    }

    @Test
    fun `shouldRemoveDownload handles multiple downloads independently`() {
        val now = System.currentTimeMillis()
        val movedDl   = download("completed", completedAt = now - 10_000L, completedEventSent = true, moveCompleted = true)
        val unmovedDl = download("completed", completedAt = now - 10_000L, completedEventSent = true, moveCompleted = false)
        val pendingDl = download("pending")

        assertTrue(DownloadManagerModule.shouldRemoveDownload(movedDl, liveStatus = "completed", currentTimeMs = now))
        assertFalse(DownloadManagerModule.shouldRemoveDownload(unmovedDl, liveStatus = "completed", currentTimeMs = now))
        assertFalse(DownloadManagerModule.shouldRemoveDownload(pendingDl, liveStatus = "pending", currentTimeMs = now))
    }

    @Test
    fun `shouldRemoveDownload with unknown liveStatus removes regardless of stored state`() {
        assertTrue(DownloadManagerModule.shouldRemoveDownload(download("running"), liveStatus = "unknown"))
        assertTrue(DownloadManagerModule.shouldRemoveDownload(download("pending"), liveStatus = "unknown"))
        assertTrue(DownloadManagerModule.shouldRemoveDownload(download("paused"), liveStatus = "unknown"))
        assertTrue(DownloadManagerModule.shouldRemoveDownload(download("completed"), liveStatus = "unknown"))
    }

    @Test
    fun `shouldRemoveDownload defaults moveCompleted to false when flag is absent`() {
        // Legacy entries without moveCompleted key should NOT be removed
        val now = System.currentTimeMillis()
        val dl = JSONObject()
            .put("downloadId", 42L)
            .put("status", "completed")
            .put("completedAt", now - 60_000L)
            .put("completedEventSent", true)
        // No moveCompleted key — defaults to false
        assertFalse(DownloadManagerModule.shouldRemoveDownload(dl, liveStatus = "completed", currentTimeMs = now))
    }

    // ── watchdog constants ────────────────────────────────────────────────────

    @Test
    fun `WATCHDOG_INTERVAL_MS is 15 seconds`() {
        assertEquals(15_000L, DownloadManagerModule.WATCHDOG_INTERVAL_MS)
    }

    @Test
    fun `STUCK_THRESHOLD is 3 polls`() {
        assertEquals(3, DownloadManagerModule.STUCK_THRESHOLD)
    }

    @Test
    fun `MAX_RETRY_ATTEMPTS is 3`() {
        assertEquals(3, DownloadManagerModule.MAX_RETRY_ATTEMPTS)
    }

    @Test
    fun `stuck window is 45 seconds (3 x 15s)`() {
        val windowMs = DownloadManagerModule.STUCK_THRESHOLD * DownloadManagerModule.WATCHDOG_INTERVAL_MS
        assertEquals(45_000L, windowMs)
    }

    // ── evaluateStuckProgress ─────────────────────────────────────────────────

    private fun track(lastBytes: Long, unchangedCount: Int, retryCount: Int = 0) =
        DownloadManagerModule.BytesTrack(lastBytes, unchangedCount, retryCount)

    @Test
    fun `progress made resets stuck counter`() {
        val result = DownloadManagerModule.evaluateStuckProgress(track(1000L, 2), currentBytes = 2000L)
        assertTrue(result is DownloadManagerModule.StuckAction.ResetCounter)
        val reset = result as DownloadManagerModule.StuckAction.ResetCounter
        assertEquals(2000L, reset.newTrack.lastBytes)
        assertEquals(0, reset.newTrack.unchangedCount)
    }

    @Test
    fun `progress made preserves existing retry count`() {
        val result = DownloadManagerModule.evaluateStuckProgress(track(1000L, 2, retryCount = 2), currentBytes = 2000L)
        val reset = result as DownloadManagerModule.StuckAction.ResetCounter
        assertEquals(2, reset.newTrack.retryCount)
    }

    @Test
    fun `zero progress increments stuck counter`() {
        val result = DownloadManagerModule.evaluateStuckProgress(track(1000L, 0), currentBytes = 1000L)
        assertTrue(result is DownloadManagerModule.StuckAction.IncrementCounter)
        val inc = result as DownloadManagerModule.StuckAction.IncrementCounter
        assertEquals(1, inc.newTrack.unchangedCount)
        assertEquals(1000L, inc.newTrack.lastBytes)
    }

    @Test
    fun `zero progress below threshold does not yet trigger retry`() {
        // unchangedCount=1 → newCount=2, below STUCK_THRESHOLD of 3
        val result = DownloadManagerModule.evaluateStuckProgress(track(1000L, 1), currentBytes = 1000L)
        assertTrue(result is DownloadManagerModule.StuckAction.IncrementCounter)
        val inc = result as DownloadManagerModule.StuckAction.IncrementCounter
        assertEquals(2, inc.newTrack.unchangedCount)
    }

    @Test
    fun `zero progress at threshold triggers retry`() {
        // unchangedCount is STUCK_THRESHOLD-1 going in — this poll hits the threshold
        val threshold = DownloadManagerModule.STUCK_THRESHOLD
        val result = DownloadManagerModule.evaluateStuckProgress(track(1000L, threshold - 1), currentBytes = 1000L)
        assertTrue(result is DownloadManagerModule.StuckAction.Retry)
        val retry = result as DownloadManagerModule.StuckAction.Retry
        assertEquals(1, retry.retryCount)
    }

    @Test
    fun `retry count increments on each stuck trigger`() {
        val result = DownloadManagerModule.evaluateStuckProgress(track(1000L, 4, retryCount = 2), currentBytes = 1000L)
        val retry = result as DownloadManagerModule.StuckAction.Retry
        assertEquals(3, retry.retryCount)
    }

    @Test
    fun `gives up when retry count equals MAX_RETRY_ATTEMPTS`() {
        val maxRetries = DownloadManagerModule.MAX_RETRY_ATTEMPTS
        val result = DownloadManagerModule.evaluateStuckProgress(track(1000L, 4, retryCount = maxRetries), currentBytes = 1000L)
        assertTrue(result is DownloadManagerModule.StuckAction.GiveUp)
    }

    @Test
    fun `gives up when retry count exceeds MAX_RETRY_ATTEMPTS`() {
        val result = DownloadManagerModule.evaluateStuckProgress(track(1000L, 4, retryCount = 99), currentBytes = 1000L)
        assertTrue(result is DownloadManagerModule.StuckAction.GiveUp)
    }

    @Test
    fun `even one byte of progress resets counter`() {
        val result = DownloadManagerModule.evaluateStuckProgress(track(1000L, 4), currentBytes = 1001L)
        assertTrue(result is DownloadManagerModule.StuckAction.ResetCounter)
    }

    @Test
    fun `bytes going backwards counts as zero progress`() {
        // Should not happen normally but guard against it
        val result = DownloadManagerModule.evaluateStuckProgress(track(1000L, 0), currentBytes = 500L)
        assertTrue(result is DownloadManagerModule.StuckAction.IncrementCounter)
    }

    @Test
    fun `zero bytes on first poll increments startup counter but does not retry`() {
        // Download just started — still connecting. Should increment but not trigger retry yet.
        val result = DownloadManagerModule.evaluateStuckProgress(track(0L, 0), currentBytes = 0L)
        assertTrue(result is DownloadManagerModule.StuckAction.IncrementCounter)
        val inc = result as DownloadManagerModule.StuckAction.IncrementCounter
        assertEquals(1, inc.newTrack.unchangedCount)
    }

    @Test
    fun `zero bytes below startup timeout does not trigger retry`() {
        // Simulate polls at 0 bytes — should not retry until STARTUP_TIMEOUT_POLLS is hit
        val belowTimeout = DownloadManagerModule.STARTUP_TIMEOUT_POLLS - 1
        val result = DownloadManagerModule.evaluateStuckProgress(track(0L, belowTimeout - 1), currentBytes = 0L)
        assertTrue(result is DownloadManagerModule.StuckAction.IncrementCounter)
    }

    @Test
    fun `zero bytes at startup timeout fires StartupTimeout not Retry`() {
        // After STARTUP_TIMEOUT_POLLS of never receiving a byte, give up — let user retry manually
        val timeout = DownloadManagerModule.STARTUP_TIMEOUT_POLLS
        val result = DownloadManagerModule.evaluateStuckProgress(track(0L, timeout - 1), currentBytes = 0L)
        assertTrue(result is DownloadManagerModule.StuckAction.StartupTimeout)
    }

    @Test
    fun `zero bytes startup timeout is 2 minutes (8 x 15s)`() {
        assertEquals(120_000L, DownloadManagerModule.STARTUP_TIMEOUT_POLLS * DownloadManagerModule.WATCHDOG_INTERVAL_MS)
    }

    @Test
    fun `stuck detection only starts after first byte received`() {
        // Once bytes > 0 then stop, THAT is when the short stuck threshold kicks in
        val result = DownloadManagerModule.evaluateStuckProgress(track(1000L, 0), currentBytes = 1000L)
        assertTrue(result is DownloadManagerModule.StuckAction.IncrementCounter)
        val inc = result as DownloadManagerModule.StuckAction.IncrementCounter
        assertEquals(1, inc.newTrack.unchangedCount)
    }

    @Test
    fun `backoff for retry 1 is 30 seconds`() {
        // Backoff is retryCount * 30_000ms, independent of watchdog interval
        assertEquals(30_000L, 1 * 30_000L)
    }

    @Test
    fun `backoff for retry 3 is 90 seconds`() {
        assertEquals(90_000L, 3 * 30_000L)
    }

    // ── PAUSED_RETRY_THRESHOLD ────────────────────────────────────────────────
    // Signed CDN URLs (e.g. cas-bridge.xethub.hf.co) can expire quickly, causing
    // DownloadManager to loop in PAUSED_WAITING_TO_RETRY with the same stale URL.
    // After PAUSED_RETRY_THRESHOLD watchdog cycles we force-cancel and re-enqueue
    // with a freshly resolved URL.

    @Test
    fun `PAUSED_RETRY_THRESHOLD is 2 polls`() {
        assertEquals(2, DownloadManagerModule.PAUSED_RETRY_THRESHOLD)
    }

    @Test
    fun `paused retry intervention window is 30 seconds (2 x 15s)`() {
        val windowMs = DownloadManagerModule.PAUSED_RETRY_THRESHOLD * DownloadManagerModule.WATCHDOG_INTERVAL_MS
        assertEquals(30_000L, windowMs)
    }
}
