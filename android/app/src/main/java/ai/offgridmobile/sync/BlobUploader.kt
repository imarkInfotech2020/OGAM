package ai.offgridmobile.sync

import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Sending a payload to the endpoint the other device offered.
 *
 * The file is sealed as it goes out - read a block, encrypt it, write it to the socket - so nothing
 * is staged, nothing is copied, and a model larger than this phone's RAM moves without ever being
 * held in it. That is the whole reason this is native: the same work in JavaScript would carry every
 * byte across the bridge on the thread that draws the screen.
 *
 * The length is declared up front and the connection is put in fixed-length streaming mode, which is
 * what stops HttpURLConnection from buffering the entire body in memory before it sends a thing.
 */
object BlobUploader {
    private const val TIMEOUT_MS = 30_000

    /** Uploads still in flight, so cancel can reach the bytes rather than only stop watching them. */
    private val inFlight = java.util.concurrent.ConcurrentHashMap<String, HttpURLConnection>()

    /**
     * Stop an upload that is still going.
     *
     * Disconnecting the connection makes the write fail, which unwinds the loop and closes the file:
     * without it, a cancelled transfer carries on sending a four gigabyte model to a peer that is no
     * longer expecting it.
     */
    fun abort(requestId: String) {
        inFlight.remove(requestId)?.disconnect()
    }

    fun upload(
        request: Request,
        onProgress: (bytes: Long) -> Unit,
    ): Long {
        val file = File(request.sourcePath)
        val fileSize = file.length()
        if (fileSize <= 0L) throw IllegalStateException("there is nothing at ${request.sourcePath}")
        val cipher = BlobFrameCipher(
            keyBase64 = request.keyBase64,
            nonceBase64 = request.nonceBase64,
            fileSize = fileSize,
            frameBytes = request.frameBytes,
        )
        val connection = (URL(request.url).openConnection() as HttpURLConnection).apply {
            requestMethod = "PUT"
            doOutput = true
            connectTimeout = TIMEOUT_MS
            readTimeout = TIMEOUT_MS
            setRequestProperty("authorization", "Bearer ${request.token}")
            setRequestProperty("content-type", "application/octet-stream")
            // Declared up front, which is also what stops HttpURLConnection from buffering the whole
            // body in memory before it sends anything - fatal for a model larger than the phone's RAM.
            setFixedLengthStreamingMode(cipher.sealedRemainder(request.offset))
        }
        inFlight[request.requestId] = connection
        try {
            var sent = request.offset
            connection.outputStream.use { sink ->
                file.inputStream().use { source ->
                    // Skip what the receiver already has rather than re-reading it from disk.
                    if (request.offset > 0) source.skip(request.offset)
                    for (index in cipher.frameAt(request.offset) until cipher.frameCount) {
                        val length = cipher.frameLength(index)
                        val plain = ByteArray(length)
                        // Read until the frame is full: a single read may return less than asked, and
                        // treating that as the end of the file would seal the wrong bytes.
                        var filled = 0
                        while (filled < length) {
                            val count = source.read(plain, filled, length - filled)
                            if (count <= 0) break
                            filled += count
                        }
                        if (filled != length) {
                            throw IllegalStateException("frame $index read short: $filled of $length")
                        }
                        sink.write(cipher.seal(plain, length, index))
                        sent += length
                        onProgress(sent)
                    }
                }
            }
            val status = connection.responseCode
            if (status != 200) throw IllegalStateException("the endpoint answered $status")
            return sent
        } finally {
            inFlight.remove(request.requestId)
            connection.disconnect()
        }
    }

    class Request(
        /** The transfer this is, so a cancel can find it. */
        val requestId: String,
        /** Payload bytes the receiver already holds. Nothing before this is read or sent again. */
        val offset: Long,
        val sourcePath: String,
        val url: String,
        val token: String,
        val keyBase64: String,
        val nonceBase64: String,
        /** The frame size, passed down rather than restated, so one place decides it everywhere. */
        val frameBytes: Int,
    )
}
