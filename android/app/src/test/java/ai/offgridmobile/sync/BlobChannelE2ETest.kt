package ai.offgridmobile.sync

import java.io.File
import java.security.MessageDigest
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.random.Random
import org.json.JSONObject
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import android.app.Application
import org.robolectric.annotation.Config

/**
 * A real transfer between this phone's code and the Mac's, both ways.
 *
 * The Mac's end is the ACTUAL desktop host, bundled from the desktop repo and run in a real node
 * process, and the payload crosses a real socket. That is the point: a test that talks to a second
 * copy of our own format proves only that the two copies agree with each other. Here one platform's
 * shipping code seals the payload and another platform's shipping code opens it, and the file that
 * lands is compared byte for byte - so a frame size, a nonce or an authenticated field that differs by
 * one byte fails here, in a test, instead of on somebody's phone with a four gigabyte model.
 *
 * The bundle is built by `mobile/scripts/blob-e2e/bundle-desktop-host.sh`. Without it this test says so
 * and skips, rather than pretending to have proven anything.
 */
@RunWith(RobolectricTestRunner::class)
// Robolectric ships images up to 34; the app targets 36 and none of this depends on the difference.
@Config(manifest = Config.NONE, sdk = [34], application = Application::class)
class BlobChannelE2ETest {
    /** Walk up from wherever the test runner started until the harness is in sight. */
    private val e2e: File = run {
        var here: File? = File(System.getProperty("user.dir") ?: ".").absoluteFile
        while (here != null && !File(here, "scripts/blob-e2e").isDirectory) here = here.parentFile
        File(here ?: File("."), "scripts/blob-e2e")
    }
    private val bundle = File(e2e, ".build/desktop-blob-host.cjs")
    private val syncBundle = File(e2e, ".build/offgrid-sync.cjs")
    private val secret = "a-shared-pairing-secret"
    private val frameBytes = 4 * 1024 * 1024
    /** Three frames with a short last one, which is where an off-by-one in the format would hide. */
    private val payload = Random(7).nextBytes(10 * 1024 * 1024)

    @Test
    fun `a payload sealed on this phone opens on the mac, byte for byte`() {
        assumeTrue("the desktop host bundle is missing - run bundle-desktop-host.sh", bundle.exists())
        val source = File.createTempFile("blob-payload", ".bin").apply { writeBytes(payload) }
        val destination = File.createTempFile("blob-landed", ".bin").apply { delete() }
        val requestId = "android-to-mac"

        val mac = node(
            "serve",
            "--request-id", requestId,
            "--secret", secret,
            "--dest", destination.absolutePath,
            "--size", payload.size.toString(),
        )
        try {
            val endpoint = mac.nextJson()
            val sent = BlobUploader.upload(
                BlobUploader.Request(
                    requestId = requestId,
                    // A fresh upload: these four journeys each send a whole payload and assert every byte lands,
                    // so nothing is already held on the far side. Resume from a non-zero offset is its own
                    // behaviour and has no Kotlin-side test yet.
                    offset = 0L,
                    sourcePath = source.absolutePath,
                    url = endpoint.getString("url"),
                    token = endpoint.getString("token"),
                    keyBase64 = endpoint.getString("keyBase64"),
                    nonceBase64 = endpoint.getString("nonce"),
                    frameBytes = frameBytes,
                ),
            ) { }
            assert(sent == payload.size.toLong()) { "sent $sent of ${payload.size}" }
            val outcome = mac.nextJson()
            assert(outcome.optBoolean("received")) { "the mac did not accept it: $outcome" }
            assert(outcome.getString("sha256") == sha256(payload)) {
                "what landed on the mac is not what left this phone"
            }
        } finally {
            mac.stop()
            source.delete()
            destination.delete()
        }
    }

    @Test
    fun `a payload sealed on the mac opens on this phone, byte for byte`() {
        assumeTrue("the desktop host bundle is missing - run bundle-desktop-host.sh", bundle.exists())
        val source = File.createTempFile("blob-payload", ".bin").apply { writeBytes(payload) }
        val destination = File.createTempFile("blob-landed", ".bin").apply { delete() }
        val requestId = "mac-to-android"
        // The receiving device mints the material - here that is this phone, whose JavaScript would.
        val material = mintMaterial(requestId)
        val settled = CountDownLatch(1)
        var accepted = false
        val server = BlobServer(
            onProgress = { _, _ -> },
            onOutcome = { _, landed ->
                accepted = landed
                settled.countDown()
            },
        )
        try {
            val port = server.ensureListening()
            server.offer(
                requestId,
                BlobServer.Pending(
                    token = material.getString("token"),
                    destinationPath = destination.absolutePath,
                    fileSize = payload.size.toLong(),
                    keyBase64 = material.getString("keyBase64"),
                    nonceBase64 = material.getString("nonceBase64"),
                    frameBytes = frameBytes,
                    // Nothing on disk yet: each of these journeys receives a whole payload and compares every
                    // byte, so the arriving stream starts at zero rather than continuing a partial file.
                    offset = 0L,
                    expiresAt = System.currentTimeMillis() + 300_000,
                ),
            )
            val mac = node(
                "stream",
                "--request-id", requestId,
                "--secret", secret,
                "--url", "http://127.0.0.1:$port/blob/$requestId",
                "--token", material.getString("token"),
                "--nonce", material.getString("nonceBase64"),
                "--source", source.absolutePath,
            )
            val sent = mac.nextJson()
            assert(sent.optBoolean("sent")) { "the mac could not send it: $sent" }
            assert(settled.await(60, TimeUnit.SECONDS)) { "this phone never settled the transfer" }
            assert(accepted) { "this phone refused a payload the mac sealed correctly" }
            assert(sha256(destination.readBytes()) == sha256(payload)) {
                "what landed on this phone is not what left the mac"
            }
            mac.stop()
        } finally {
            server.stop()
            source.delete()
            destination.delete()
        }
    }

    @Test
    fun `a payload sealed with another pairing is refused and nothing lands`() {
        assumeTrue("the desktop host bundle is missing - run bundle-desktop-host.sh", bundle.exists())
        val source = File.createTempFile("blob-payload", ".bin").apply { writeBytes(payload) }
        val destination = File.createTempFile("blob-refused", ".bin").apply { delete() }
        val requestId = "mac-to-android-wrong"
        // This phone expects one pairing; the Mac will seal with another.
        val material = mintMaterial(requestId, "a-different-pairing")
        val settled = CountDownLatch(1)
        var accepted = true
        val server = BlobServer(
            onProgress = { _, _ -> },
            onOutcome = { _, landed ->
                accepted = landed
                settled.countDown()
            },
        )
        try {
            val port = server.ensureListening()
            server.offer(
                requestId,
                BlobServer.Pending(
                    token = material.getString("token"),
                    destinationPath = destination.absolutePath,
                    fileSize = payload.size.toLong(),
                    keyBase64 = material.getString("keyBase64"),
                    nonceBase64 = material.getString("nonceBase64"),
                    frameBytes = frameBytes,
                    // Nothing on disk yet: each of these journeys receives a whole payload and compares every
                    // byte, so the arriving stream starts at zero rather than continuing a partial file.
                    offset = 0L,
                    expiresAt = System.currentTimeMillis() + 300_000,
                ),
            )
            val mac = node(
                "stream",
                "--request-id", requestId,
                "--secret", secret,
                "--url", "http://127.0.0.1:$port/blob/$requestId",
                "--token", material.getString("token"),
                "--nonce", material.getString("nonceBase64"),
                "--source", source.absolutePath,
            )
            mac.nextJson()
            assert(settled.await(60, TimeUnit.SECONDS)) { "this phone never settled the transfer" }
            assert(!accepted) { "a payload sealed with another pairing was accepted" }
            assert(!destination.exists() || destination.length() == 0L) {
                "an unopenable payload was left on disk"
            }
            mac.stop()
        } finally {
            server.stop()
            source.delete()
            destination.delete()
        }
    }

    /**
     * Phone to phone, with no Mac in the middle.
     *
     * This is the pairing that was slowest of all before the fast path existed, and the one with no
     * desktop to lean on: the iPhone hosts the endpoint from its own shipping Swift, and this phone
     * streams to it from its own shipping Kotlin.
     */
    @Test
    fun `a payload sealed on this phone opens on an iphone, byte for byte`() {
        val harness = File(e2e, ".build/blob-harness-ios")
        assumeTrue("the iOS harness is missing - run build-ios-harness.sh", harness.canExecute())
        val source = File.createTempFile("blob-payload", ".bin").apply { writeBytes(payload) }
        val destination = File.createTempFile("blob-on-iphone", ".bin").apply { delete() }
        val requestId = "android-to-ios"
        val material = mintMaterial(requestId)

        val iphone = Node(
            ProcessBuilder(
                harness.absolutePath,
                "serve",
                requestId,
                destination.absolutePath,
                payload.size.toString(),
                material.getString("keyBase64"),
                material.getString("nonceBase64"),
                material.getString("token"),
                frameBytes.toString(),
            ).redirectErrorStream(true).start(),
        )
        try {
            val offered = iphone.nextJson()
            val sent = BlobUploader.upload(
                BlobUploader.Request(
                    requestId = requestId,
                    // A fresh upload: these four journeys each send a whole payload and assert every byte lands,
                    // so nothing is already held on the far side. Resume from a non-zero offset is its own
                    // behaviour and has no Kotlin-side test yet.
                    offset = 0L,
                    sourcePath = source.absolutePath,
                    url = offered.getString("url"),
                    token = material.getString("token"),
                    keyBase64 = material.getString("keyBase64"),
                    nonceBase64 = material.getString("nonceBase64"),
                    frameBytes = frameBytes,
                ),
            ) { }
            assert(sent == payload.size.toLong()) { "sent $sent of ${payload.size}" }
            val outcome = iphone.nextJson()
            assert(outcome.optBoolean("received")) { "the iphone did not accept it: $outcome" }
            assert(sha256(destination.readBytes()) == sha256(payload)) {
                "what landed on the iphone is not what left this phone"
            }
        } finally {
            iphone.stop()
            source.delete()
            destination.delete()
        }
    }

    // ------------------------------------------------------------------ plumbing

    private fun mintMaterial(requestId: String, pairing: String = secret): JSONObject {
        // The shared package mints it, exactly as the app's JavaScript does.
        val process = ProcessBuilder(
            "node",
            "-e",
            "const s=require(process.argv[1]);" +
                "process.stdout.write(JSON.stringify(s.createBlobMaterial(process.argv[2],process.argv[3])))",
            syncBundle.absolutePath,
            pairing,
            requestId,
        ).redirectErrorStream(false).start()
        val text = process.inputStream.bufferedReader().readText()
        process.waitFor(30, TimeUnit.SECONDS)
        return JSONObject(text)
    }

    private inner class Node(private val process: Process) {
        private val reader = process.inputStream.bufferedReader()

        fun nextJson(): JSONObject {
            val line = reader.readLine() ?: error("the mac said nothing")
            return JSONObject(line)
        }

        fun stop() {
            process.destroy()
        }
    }

    private fun node(vararg args: String): Node {
        val command = mutableListOf("node", File(e2e, "desktop-side.mjs").absolutePath)
        command.addAll(args)
        val builder = ProcessBuilder(command).redirectErrorStream(true)
        builder.environment()["BLOB_HOST_BUNDLE"] = bundle.absolutePath
        builder.environment()["BLOB_SYNC_BUNDLE"] = syncBundle.absolutePath
        return Node(builder.start())
    }

    private fun sha256(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") {
            "%02x".format(it)
        }
}
