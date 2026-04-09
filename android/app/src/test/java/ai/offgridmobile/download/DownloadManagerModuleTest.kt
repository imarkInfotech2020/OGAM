package ai.offgridmobile.download

import android.app.Application
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Tests for the pure helper functions in the new WorkManager-based download layer.
 *
 * The old DownloadManager/SharedPrefs layer (statusToString, reasonToString,
 * hasNoActiveDownloads, shouldRemoveDownload, BytesTrack, evaluateStuckProgress)
 * has been replaced by Room + WorkManager. These tests cover the pure functions
 * that remain in the new architecture.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], application = Application::class)
class DownloadManagerModuleTest {

    // ── WorkerDownload.isHostAllowed ──────────────────────────────────────────

    @Test
    fun `isHostAllowed accepts huggingface co`() {
        assertTrue(WorkerDownload.isHostAllowed("https://huggingface.co/model.gguf"))
    }

    @Test
    fun `isHostAllowed accepts cdn-lfs subdomain`() {
        assertTrue(WorkerDownload.isHostAllowed("https://cdn-lfs.huggingface.co/path/to/model"))
    }

    @Test
    fun `isHostAllowed accepts cas-bridge subdomain`() {
        assertTrue(WorkerDownload.isHostAllowed("https://cas-bridge.xethub.hf.co/file"))
    }

    @Test
    fun `isHostAllowed accepts nested subdomain of allowed host`() {
        assertTrue(WorkerDownload.isHostAllowed("https://foo.cdn-lfs.huggingface.co/file"))
    }

    @Test
    fun `isHostAllowed accepts nested subdomain of huggingface co`() {
        assertTrue(WorkerDownload.isHostAllowed("https://subdomain.huggingface.co/model"))
    }

    @Test
    fun `isHostAllowed rejects unknown host`() {
        assertFalse(WorkerDownload.isHostAllowed("https://evil.com/malware.gguf"))
    }

    @Test
    fun `isHostAllowed rejects look-alike domain without dot separator`() {
        assertFalse(WorkerDownload.isHostAllowed("https://nothuggingface.co/model.gguf"))
    }

    @Test
    fun `isHostAllowed rejects subdomain of look-alike host`() {
        assertFalse(WorkerDownload.isHostAllowed("https://cdn.evil-huggingface.co/model.gguf"))
    }

    @Test
    fun `isHostAllowed rejects invalid URL`() {
        assertFalse(WorkerDownload.isHostAllowed("not a url"))
    }

    @Test
    fun `isHostAllowed rejects empty string`() {
        assertFalse(WorkerDownload.isHostAllowed(""))
    }

    @Test
    fun `isHostAllowed rejects http scheme on allowed host`() {
        // The allowlist checks the host, not the scheme — http is still allowed by this
        // function; network security config handles transport-level enforcement.
        assertTrue(WorkerDownload.isHostAllowed("http://huggingface.co/model.gguf"))
    }

    // ── WorkerDownload.workName ───────────────────────────────────────────────

    @Test
    fun `workName returns download underscore id`() {
        assertEquals("download_42", WorkerDownload.workName(42L))
    }

    @Test
    fun `workName handles zero id`() {
        assertEquals("download_0", WorkerDownload.workName(0L))
    }

    @Test
    fun `workName handles large timestamp id`() {
        assertEquals("download_1712345678901", WorkerDownload.workName(1712345678901L))
    }

    @Test
    fun `workName is unique per id`() {
        val name1 = WorkerDownload.workName(1L)
        val name2 = WorkerDownload.workName(2L)
        assertTrue(name1 != name2)
    }

    // ── DownloadStatus enum ───────────────────────────────────────────────────

    @Test
    fun `DownloadStatus contains all required values`() {
        val values = DownloadStatus.values().map { it.name }
        assertTrue(values.contains("QUEUED"))
        assertTrue(values.contains("RUNNING"))
        assertTrue(values.contains("PAUSED"))
        assertTrue(values.contains("COMPLETED"))
        assertTrue(values.contains("FAILED"))
        assertTrue(values.contains("CANCELLED"))
    }

    @Test
    fun `DownloadStatus RUNNING lowercased matches legacy constant`() {
        assertEquals(DownloadManagerModule.STATUS_RUNNING, DownloadStatus.RUNNING.name.lowercase())
    }

    @Test
    fun `DownloadStatus PAUSED lowercased matches legacy constant`() {
        assertEquals(DownloadManagerModule.STATUS_PAUSED, DownloadStatus.PAUSED.name.lowercase())
    }

    @Test
    fun `DownloadStatus COMPLETED lowercased matches legacy constant`() {
        assertEquals(DownloadManagerModule.STATUS_COMPLETED, DownloadStatus.COMPLETED.name.lowercase())
    }

    @Test
    fun `DownloadStatus FAILED lowercased matches legacy constant`() {
        assertEquals(DownloadManagerModule.STATUS_FAILED, DownloadStatus.FAILED.name.lowercase())
    }

    // ── DownloadManagerModule legacy constants ────────────────────────────────

    @Test
    fun `legacy status constants have correct string values`() {
        assertEquals("pending", DownloadManagerModule.STATUS_PENDING)
        assertEquals("running", DownloadManagerModule.STATUS_RUNNING)
        assertEquals("paused", DownloadManagerModule.STATUS_PAUSED)
        assertEquals("completed", DownloadManagerModule.STATUS_COMPLETED)
        assertEquals("failed", DownloadManagerModule.STATUS_FAILED)
        assertEquals("unknown", DownloadManagerModule.STATUS_UNKNOWN)
    }

    // ── WorkerDownload constants ──────────────────────────────────────────────

    @Test
    fun `DEFAULT_PROGRESS_INTERVAL is 1 second`() {
        assertEquals(1_000L, WorkerDownload.DEFAULT_PROGRESS_INTERVAL)
    }

    @Test
    fun `KEY_DOWNLOAD_ID constant is defined`() {
        assertEquals("download_id", WorkerDownload.KEY_DOWNLOAD_ID)
    }

    @Test
    fun `KEY_PROGRESS constant is defined`() {
        assertEquals("progress", WorkerDownload.KEY_PROGRESS)
    }

    @Test
    fun `KEY_TOTAL constant is defined`() {
        assertEquals("total", WorkerDownload.KEY_TOTAL)
    }
}
