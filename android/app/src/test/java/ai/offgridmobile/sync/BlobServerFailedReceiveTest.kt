package ai.offgridmobile.sync

import java.io.File
import java.net.Socket
import java.util.Base64
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test

/**
 * What is left on this phone's disk when a transfer fails midway.
 *
 * A failed transfer starts over rather than resuming, and the way that is expressed is by removing the
 * destination file. The removal is advisory though - delete() can refuse while another process holds the
 * file - and the resume offset the sending side uses IS the destination's size on disk
 * (pro/sync/sharedFileTransfer.ts reads it with stat). So a partial file that outlives a failed transfer
 * is not inert: it is read as progress, and the restart silently becomes a resume of an attempt that
 * failed.
 *
 * These drive the REAL server over a REAL socket - no fake, no double - and assert the thing a later
 * attempt actually looks at: whether the destination is resumable afterwards.
 *
 * The server is plain JVM code (java.io and java.net, no Android framework), so it runs here as itself.
 */
class BlobServerFailedReceiveTest {
    private val key = Base64.getEncoder().encodeToString(ByteArray(32) { 7 })
    private val nonce = Base64.getEncoder().encodeToString(ByteArray(12) { 3 })

    private fun pending(destination: File, token: String, fileSize: Long) = BlobServer.Pending(
        token = token,
        destinationPath = destination.absolutePath,
        fileSize = fileSize,
        keyBase64 = key,
        nonceBase64 = nonce,
        frameBytes = 4 * 1024 * 1024,
        offset = 0,
        expiresAt = System.currentTimeMillis() + 60_000,
    )

    /**
     * A PUT whose declared length is not the length this payload can possibly be. The server rejects it
     * before a single byte is written, which is the cheapest way to reach the failure path without
     * having to seal a payload first.
     */
    private fun putWithWrongLength(port: Int, requestId: String, token: String): String =
        Socket("127.0.0.1", port).use { client ->
            client.getOutputStream().apply {
                write(
                    (
                        "PUT /blob/$requestId HTTP/1.1\r\n" +
                            "authorization: Bearer $token\r\n" +
                            "content-length: 9\r\n\r\n"
                        ).toByteArray()
                )
                write(ByteArray(9))
                flush()
            }
            client.getInputStream().bufferedReader().readLine() ?: ""
        }

    @Test
    fun `a failed receive leaves nothing a later attempt would resume from`() {
        val destination = File.createTempFile("blob-partial", ".bin")
        // Bytes from an attempt that got part way: frame-aligned, so they would be accepted as resume
        // progress rather than rejected out of hand.
        destination.writeBytes(ByteArray(4 * 1024 * 1024) { 1 })

        val outcomes = failingReceive(destination, "failing-transfer")

        assertEquals(listOf(false), outcomes)
        assertFalse("the partial payload should be gone", destination.exists())
    }

    /**
     * The case the fix exists for, and the only one that tells the two versions of this code apart.
     *
     * delete() needs write permission on the PARENT directory, while truncating needs it on the file - so a
     * writable file inside a folder this app may not modify is removable-in-principle and unremovable in
     * fact. A received-files folder the user pointed at something protected has exactly this shape.
     *
     * Before the fix, delete() returned false, the result was dropped, and 4MB of a failed transfer stayed on
     * disk where the next attempt reads its size as resume progress. After it, the file is truncated, so the
     * restart happens either way.
     */
    @Test
    fun `a partial that cannot be deleted is emptied instead of left as progress`() {
        val folder = File.createTempFile("blob-protected", "").apply {
            delete()
            mkdirs()
        }
        val destination = File(folder, "landing.bin")
        destination.writeBytes(ByteArray(4 * 1024 * 1024) { 1 })
        // Nothing may be removed from the folder; the file itself stays writable.
        assumeTrue("this filesystem does not enforce directory permissions", folder.setWritable(false))
        assumeTrue("running as root - permissions are not enforced", !File(folder, "probe").let {
            val created = runCatching { it.createNewFile() }.getOrDefault(false)
            if (created) it.delete()
            created
        })

        val outcomes = try {
            failingReceive(destination, "unremovable-transfer")
        } finally {
            folder.setWritable(true)
        }

        assertEquals(listOf(false), outcomes)
        assertTrue("the file could not be deleted, so it must still exist", destination.exists())
        assertEquals(
            "a failed transfer stayed on disk as ${destination.length()} bytes of resume progress",
            0L,
            destination.length()
        )
        destination.delete()
        folder.delete()
    }

    /** Drive one transfer that the server refuses, and return the outcomes it reported. */
    private fun failingReceive(destination: File, requestId: String): List<Boolean> {
        val outcomes = mutableListOf<Boolean>()
        val reported = CountDownLatch(1)
        val server = BlobServer(
            onProgress = { _, _ -> },
            onOutcome = { _, landed ->
                outcomes.add(landed)
                reported.countDown()
            },
        )
        server.offer(requestId, pending(destination, "a-token", 8L * 1024 * 1024))
        val status = putWithWrongLength(server.ensureListening(), requestId, "a-token")
        assertTrue("the server should have refused the body: $status", status.contains("500"))
        assertTrue("the outcome has to be reported", reported.await(5, TimeUnit.SECONDS))
        server.stop()
        return outcomes
    }

    @Test
    fun `a request with the wrong token is answered without touching the destination`() {
        val destination = File.createTempFile("blob-untouched", ".bin")
        destination.writeBytes(ByteArray(64) { 2 })
        val server = BlobServer(onProgress = { _, _ -> }, onOutcome = { _, _ -> })
        server.offer("guarded-transfer", pending(destination, "the-real-token", 64L))

        val status = putWithWrongLength(server.ensureListening(), "guarded-transfer", "not-the-token")

        // 404 for everything that is wrong, and - the point here - an unauthorised caller cannot use this
        // endpoint to delete or truncate a file that a legitimate transfer is using.
        assertTrue("an unauthorised PUT must read as 404: $status", status.contains("404"))
        assertTrue("the file must still be there", destination.exists())
        assertEquals(64L, destination.length())
        assertFalse("nothing should have been truncated", destination.length() == 0L)
        server.stop()
        destination.delete()
    }
}
