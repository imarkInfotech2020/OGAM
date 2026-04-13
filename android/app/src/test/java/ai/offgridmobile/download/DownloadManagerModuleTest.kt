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
    fun isHostAllowedAcceptsHuggingfaceCo() {
        assertTrue(WorkerDownload.isHostAllowed("https://huggingface.co/model.gguf"))
    }

    @Test
    fun isHostAllowedAcceptsCdnLfsSubdomain() {
        assertTrue(WorkerDownload.isHostAllowed("https://cdn-lfs.huggingface.co/path/to/model"))
    }

    @Test
    fun isHostAllowedAcceptsCasBridgeSubdomain() {
        assertTrue(WorkerDownload.isHostAllowed("https://cas-bridge.xethub.hf.co/file"))
    }

    @Test
    fun isHostAllowedAcceptsNestedSubdomainOfAllowedHost() {
        assertTrue(WorkerDownload.isHostAllowed("https://foo.cdn-lfs.huggingface.co/file"))
    }

    @Test
    fun isHostAllowedAcceptsNestedSubdomainOfHuggingfaceCo() {
        assertTrue(WorkerDownload.isHostAllowed("https://subdomain.huggingface.co/model"))
    }

    @Test
    fun isHostAllowedRejectsUnknownHost() {
        assertFalse(WorkerDownload.isHostAllowed("https://evil.com/malware.gguf"))
    }

    @Test
    fun isHostAllowedRejectsLookAlikeDomainWithoutDotSeparator() {
        assertFalse(WorkerDownload.isHostAllowed("https://nothuggingface.co/model.gguf"))
    }

    @Test
    fun isHostAllowedRejectsSubdomainOfLookAlikeHost() {
        assertFalse(WorkerDownload.isHostAllowed("https://cdn.evil-huggingface.co/model.gguf"))
    }

    @Test
    fun isHostAllowedRejectsInvalidUrl() {
        assertFalse(WorkerDownload.isHostAllowed("not a url"))
    }

    @Test
    fun isHostAllowedRejectsEmptyString() {
        assertFalse(WorkerDownload.isHostAllowed(""))
    }

    @Test
    fun isHostAllowedAllowsHttpSchemeOnAllowedHost() {
        // The allowlist checks the host, not the scheme — http is still allowed by this
        // function; network security config handles transport-level enforcement.
        assertTrue(WorkerDownload.isHostAllowed("http://huggingface.co/model.gguf"))
    }

    // ── WorkerDownload.workName ───────────────────────────────────────────────

    @Test
    fun workNameReturnsDownloadUnderscoreId() {
        assertEquals("download_42", WorkerDownload.workName(42L))
    }

    @Test
    fun workNameHandlesZeroId() {
        assertEquals("download_0", WorkerDownload.workName(0L))
    }

    @Test
    fun workNameHandlesLargeTimestampId() {
        assertEquals("download_1712345678901", WorkerDownload.workName(1712345678901L))
    }

    @Test
    fun workNameIsUniquePerDownloadId() {
        val name1 = WorkerDownload.workName(1L)
        val name2 = WorkerDownload.workName(2L)
        assertTrue(name1 != name2)
    }

    // ── DownloadStatus enum ───────────────────────────────────────────────────

    @Test
    fun downloadStatusContainsAllRequiredValues() {
        val values = DownloadStatus.entries.map { it.name }
        assertTrue(values.contains("QUEUED"))
        assertTrue(values.contains("RUNNING"))
        assertTrue(values.contains("PAUSED"))
        assertTrue(values.contains("COMPLETED"))
        assertTrue(values.contains("FAILED"))
        assertTrue(values.contains("CANCELLED"))
    }

    @Test
    fun downloadStatusRunningLowercasedMatchesLegacyConstant() {
        assertEquals(DownloadManagerModule.STATUS_RUNNING, DownloadStatus.RUNNING.name.lowercase())
    }

    @Test
    fun downloadStatusPausedLowercasedMatchesLegacyConstant() {
        assertEquals(DownloadManagerModule.STATUS_PAUSED, DownloadStatus.PAUSED.name.lowercase())
    }

    @Test
    fun downloadStatusCompletedLowercasedMatchesLegacyConstant() {
        assertEquals(DownloadManagerModule.STATUS_COMPLETED, DownloadStatus.COMPLETED.name.lowercase())
    }

    @Test
    fun downloadStatusFailedLowercasedMatchesLegacyConstant() {
        assertEquals(DownloadManagerModule.STATUS_FAILED, DownloadStatus.FAILED.name.lowercase())
    }

    // ── DownloadManagerModule legacy constants ────────────────────────────────

    @Test
    fun legacyStatusConstantsHaveCorrectStringValues() {
        assertEquals("pending", DownloadManagerModule.STATUS_PENDING)
        assertEquals("running", DownloadManagerModule.STATUS_RUNNING)
        assertEquals("paused", DownloadManagerModule.STATUS_PAUSED)
        assertEquals("completed", DownloadManagerModule.STATUS_COMPLETED)
        assertEquals("failed", DownloadManagerModule.STATUS_FAILED)
        assertEquals("unknown", DownloadManagerModule.STATUS_UNKNOWN)
    }

    // ── WorkerDownload constants ──────────────────────────────────────────────

    @Test
    fun defaultProgressIntervalIsOneSecond() {
        assertEquals(1_000L, WorkerDownload.DEFAULT_PROGRESS_INTERVAL)
    }

    @Test
    fun keyDownloadIdConstantIsDefined() {
        assertEquals("download_id", WorkerDownload.KEY_DOWNLOAD_ID)
    }

    @Test
    fun keyProgressConstantIsDefined() {
        assertEquals("progress", WorkerDownload.KEY_PROGRESS)
    }

    @Test
    fun keyTotalConstantIsDefined() {
        assertEquals("total", WorkerDownload.KEY_TOTAL)
    }

    // ── WorkerDownload.computeFileSha256 ──────────────────────────────────────

    @Test
    fun computeFileSha256MatchesKnownHash() {
        // echo -n "hello" | sha256sum = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
        val tmp = createTempFile("sha256test", ".bin")
        try {
            tmp.writeBytes("hello".toByteArray(Charsets.UTF_8))
            assertEquals(
                "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
                WorkerDownload.computeFileSha256(tmp),
            )
        } finally {
            tmp.delete()
        }
    }

    @Test
    fun computeFileSha256EmptyFileReturnsKnownHash() {
        // sha256 of empty input = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
        val tmp = createTempFile("sha256empty", ".bin")
        try {
            tmp.writeBytes(ByteArray(0))
            assertEquals(
                "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                WorkerDownload.computeFileSha256(tmp),
            )
        } finally {
            tmp.delete()
        }
    }

    @Test
    fun computeFileSha256IsCaseInsensitiveCompatible() {
        val tmp = createTempFile("sha256case", ".bin")
        try {
            tmp.writeBytes("hello".toByteArray(Charsets.UTF_8))
            val hash = WorkerDownload.computeFileSha256(tmp)
            // Our function always returns lowercase; verify it equals the uppercase version ignoreCase
            assertTrue(hash == hash.lowercase())
        } finally {
            tmp.delete()
        }
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
