package ai.offgridmobile.sync

import java.io.BufferedOutputStream
import java.io.File
import java.io.InputStream
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ConcurrentHashMap

/**
 * Where this phone accepts the bytes of one transfer.
 *
 * The receiving device is the one that hosts, so the sender only has to be able to make an outbound
 * connection - which is the shape that works on a phone, behind a NAT, with no port forwarding. It
 * speaks the smallest useful slice of HTTP: one PUT, one token, one payload, one answer.
 *
 * Everything about it is deliberately narrow. It listens only while a transfer is pending and stops
 * the moment none is. It serves no paths of its own, lists nothing, and answers every way of being
 * wrong with the same 404. Each transfer has a path nobody can guess and a token that works once.
 */
class BlobServer(
    private val onProgress: (requestId: String, bytes: Long) -> Unit,
    /**
     * The outcome matters as much as the progress: a payload that fails to verify has to SAY so, or
     * the receiving side sits waiting for a transfer that is never going to arrive.
     */
    private val onOutcome: (requestId: String, landed: Boolean) -> Unit = { _, _ -> },
) {
    class Pending(
        val token: String,
        val destinationPath: String,
        val fileSize: Long,
        val keyBase64: String,
        val nonceBase64: String,
        /** The frame size, passed down rather than restated, so one place decides it everywhere. */
        val frameBytes: Int,
        /** Payload bytes already on disk; the arriving stream continues from here. */
        val offset: Long,
        val expiresAt: Long,
    )

    private val pending = ConcurrentHashMap<String, Pending>()
    private var socket: ServerSocket? = null
    private var accepting: Thread? = null

    /** The port this device is listening on, starting to listen if it is not already. */
    @Synchronized
    fun ensureListening(): Int {
        socket?.let { if (!it.isClosed) return it.localPort }
        val opened = ServerSocket(0)
        socket = opened
        accepting = Thread { acceptLoop(opened) }.apply {
            isDaemon = true
            start()
        }
        return opened.localPort
    }

    fun offer(requestId: String, transfer: Pending) {
        pending[requestId] = transfer
    }

    @Synchronized
    fun release(requestId: String) {
        pending.remove(requestId)
        // Nothing waiting means nothing listening: an open port with no purpose is only exposure.
        if (pending.isEmpty()) stop()
    }

    @Synchronized
    fun stop() {
        runCatching { socket?.close() }
        socket = null
        accepting = null
    }

    private fun acceptLoop(server: ServerSocket) {
        while (!server.isClosed) {
            val client = runCatching { server.accept() } .getOrNull() ?: return
            Thread { serve(client) }.apply { isDaemon = true }.start()
        }
    }

    private fun serve(client: Socket) {
        client.use {
            val input = client.getInputStream().buffered()
            val output = BufferedOutputStream(client.getOutputStream())
            val request = readHead(input) ?: return respond(output, "404 Not Found")
            val transfer = authorise(request) ?: return respond(output, "404 Not Found")
            // The token is spent: a payload arrives once, and a second attempt negotiates again.
            pending.remove(request.requestId)
            if (request.expectsContinue) {
                output.write("HTTP/1.1 100 Continue\r\n\r\n".toByteArray())
                output.flush()
            }
            val landed = runCatching { receive(input, request, transfer) }
            respond(output, if (landed.isSuccess) "200 OK" else "500 Internal Server Error")
            if (landed.isFailure) File(transfer.destinationPath).delete()
            onOutcome(request.requestId, landed.isSuccess)
            if (pending.isEmpty()) stop()
        }
    }

    private fun receive(input: InputStream, request: Head, transfer: Pending) {
        val destination = File(transfer.destinationPath)
        destination.parentFile?.mkdirs()
        val cipher = BlobFrameCipher(
            keyBase64 = transfer.keyBase64,
            nonceBase64 = transfer.nonceBase64,
            fileSize = transfer.fileSize,
            frameBytes = transfer.frameBytes,
        )
        if (request.contentLength != cipher.sealedRemainder(transfer.offset)) {
            throw IllegalStateException("the body is not the length this payload should be")
        }
        // Whatever lay past the resume point was part of a frame that never finished arriving, so it
        // goes: the side that writes the payload owns what is already in it.
        if (transfer.offset > 0 && destination.exists()) {
            java.io.RandomAccessFile(destination, "rw").use { it.setLength(transfer.offset) }
        }
        var landed = transfer.offset
        // Nothing reaches the file until the frame it belongs to has verified, so memory holds one
        // frame - never the payload - and a tampered or truncated transfer fails instead of landing.
        // Appending when resuming: what is already here was verified when it arrived.
        java.io.FileOutputStream(destination, transfer.offset > 0).use { sink ->
            for (index in cipher.frameAt(transfer.offset) until cipher.frameCount) {
                val length = cipher.sealedLength(index)
                val sealed = ByteArray(length)
                var filled = 0
                while (filled < length) {
                    val count = input.read(sealed, filled, length - filled)
                    if (count <= 0) throw IllegalStateException("the payload ended early")
                    filled += count
                }
                val plain = cipher.open(sealed, length, index)
                sink.write(plain)
                landed += plain.size
                onProgress(request.requestId, minOf(landed, transfer.fileSize))
            }
        }
        if (destination.length() != transfer.fileSize) {
            throw IllegalStateException("the payload is not the size that was offered")
        }
    }

    private fun authorise(request: Head): Pending? {
        val transfer = pending[request.requestId] ?: return null
        if (transfer.expiresAt <= System.currentTimeMillis()) return null
        val presented = request.token.toByteArray()
        val expected = transfer.token.toByteArray()
        if (presented.size != expected.size) return null
        // Constant time, so a wrong token tells the caller nothing about how wrong it was.
        var difference = 0
        for (index in expected.indices) difference = difference or (presented[index].toInt() xor expected[index].toInt())
        return if (difference == 0) transfer else null
    }

    private fun respond(output: BufferedOutputStream, status: String) {
        runCatching {
            output.write("HTTP/1.1 $status\r\ncontent-length: 0\r\nconnection: close\r\n\r\n".toByteArray())
            output.flush()
        }
    }

    private class Head(
        val requestId: String,
        val token: String,
        val contentLength: Long,
        val expectsContinue: Boolean,
    )

    /** The request line and the three headers that matter. Anything else is ignored. */
    private fun readHead(input: InputStream): Head? {
        val lines = mutableListOf<String>()
        while (lines.size <= MAX_HEADERS) {
            val line = readLine(input) ?: return null
            if (line.isEmpty()) break
            lines.add(line)
        }
        val requestLine = lines.firstOrNull()?.split(' ') ?: return null
        if (requestLine.size < 2 || requestLine[0] != "PUT") return null
        val path = requestLine[1]
        if (!path.startsWith(PREFIX)) return null
        val headers = lines.drop(1).mapNotNull { line ->
            val split = line.indexOf(':')
            if (split <= 0) null else line.substring(0, split).lowercase().trim() to line.substring(split + 1).trim()
        }.toMap()
        return Head(
            requestId = java.net.URLDecoder.decode(path.removePrefix(PREFIX), "UTF-8"),
            token = (headers["authorization"] ?: "").removePrefix("Bearer ").trim(),
            contentLength = headers["content-length"]?.toLongOrNull() ?: return null,
            expectsContinue = headers["expect"]?.contains("100-continue") == true,
        )
    }

    private fun readLine(input: InputStream): String? {
        val builder = StringBuilder()
        while (builder.length <= MAX_LINE) {
            val byte = input.read()
            if (byte < 0) return if (builder.isEmpty()) null else builder.toString()
            if (byte == '\n'.code) return builder.toString().removeSuffix("\r")
            builder.append(byte.toChar())
        }
        return null
    }

    private companion object {
        const val MAX_HEADERS = 32
        const val MAX_LINE = 4096
        const val PREFIX = "/blob/"
    }
}
