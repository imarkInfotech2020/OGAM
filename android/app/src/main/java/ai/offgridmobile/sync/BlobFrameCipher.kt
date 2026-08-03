package ai.offgridmobile.sync

import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * This phone's end of the framed payload format.
 *
 * The format - the frame size, the nonce for each frame, what each frame is authenticated against - is
 * defined once in the shared sync package and mirrored here, because native code cannot import
 * TypeScript. The frame size is passed down from JavaScript rather than restated, and the end-to-end
 * test moves real payloads between this device and the other two, so a disagreement shows up as a
 * failed test rather than a corrupt model on somebody's phone.
 *
 * Frames also buy something a single stream cannot: each one is authenticated as it ARRIVES, so a
 * corrupted payload fails early instead of after four gigabytes, and the last frame says that it is
 * the last, so a payload cut short cannot pass as a whole one.
 */
class BlobFrameCipher(
    private val keyBase64: String,
    nonceBase64: String,
    private val fileSize: Long,
    private val frameBytes: Int,
) {
    private val nonce: ByteArray = BlobCrypto.decode(nonceBase64)

    init {
        require(nonce.size == NONCE_BYTES) { "a nonce is twelve bytes" }
        require(frameBytes > 0) { "a frame has a size" }
        require(fileSize >= 0) { "a payload has a size" }
    }

    val frameCount: Int =
        maxOf(1, ((fileSize + frameBytes - 1) / frameBytes).toInt())

    /** The frame a resume begins on: offsets are always a whole number of frames. */
    fun frameAt(offset: Long): Int = (offset / frameBytes).toInt()

    /** What is left on the wire when the receiver already holds [offset] payload bytes. */
    fun sealedRemainder(offset: Long): Long =
        fileSize - offset + (frameCount - frameAt(offset)).toLong() * TAG_BYTES

    /** How many payload bytes are in a given frame. Only the last one is short. */
    fun frameLength(index: Int): Int =
        if (index < frameCount - 1) {
            frameBytes
        } else {
            (fileSize - frameBytes.toLong() * (frameCount - 1)).toInt()
        }

    /** What a frame occupies on the wire: its payload plus its tag. */
    fun sealedLength(index: Int): Int = frameLength(index) + TAG_BYTES

    /** The whole sealed body, which the sender declares before it sends a byte. */
    fun sealedLength(): Long = fileSize + frameCount.toLong() * TAG_BYTES

    fun seal(plain: ByteArray, length: Int, index: Int): ByteArray =
        cipher(Cipher.ENCRYPT_MODE, index).doFinal(plain, 0, length)

    fun open(sealed: ByteArray, length: Int, index: Int): ByteArray =
        cipher(Cipher.DECRYPT_MODE, index).doFinal(sealed, 0, length)

    private fun cipher(mode: Int, index: Int): Cipher =
        Cipher.getInstance(TRANSFORMATION).apply {
            init(
                mode,
                SecretKeySpec(BlobCrypto.decode(keyBase64), "AES"),
                GCMParameterSpec(TAG_BITS, frameNonce(index)),
            )
            // A frame is bound to its position and to whether the payload ends there, so neither the
            // ORDER nor the LENGTH of the payload can change without the tag failing.
            updateAAD(
                byteArrayOf(
                    (index ushr 24).toByte(),
                    (index ushr 16).toByte(),
                    (index ushr 8).toByte(),
                    index.toByte(),
                    if (index == frameCount - 1) 1 else 0,
                ),
            )
        }

    /** The transfer's nonce with the frame's number in its last four bytes, big-endian. */
    private fun frameNonce(index: Int): ByteArray =
        nonce.copyOf().also {
            it[8] = (index ushr 24).toByte()
            it[9] = (index ushr 16).toByte()
            it[10] = (index ushr 8).toByte()
            it[11] = index.toByte()
        }

    companion object {
        const val TAG_BYTES = 16
        private const val NONCE_BYTES = 12
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val TAG_BITS = 128
    }
}
