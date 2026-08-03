package ai.offgridmobile.sync

import android.util.Base64
import java.net.Inet4Address
import java.net.NetworkInterface

/**
 * The two small things the fast transfer path needs from the platform.
 *
 * The cipher itself lives in [BlobFrameCipher]; the KEY is never invented here and never travels -
 * JavaScript derives it from the pairing secret the two devices already share, using the one
 * derivation defined in the shared sync package, and hands it down as bytes.
 */
object BlobCrypto {
    fun decode(value: String): ByteArray = Base64.decode(value, Base64.DEFAULT)

    /**
     * This device's address on the network it shares with the user's other devices.
     *
     * A site-local IPv4, because that is what the other device can dial and what the shared rules
     * admit. No address means no endpoint can be offered, and the transfer stays on the slower path
     * that always works.
     */
    fun lanAddress(): String? {
        val interfaces = runCatching { NetworkInterface.getNetworkInterfaces() }.getOrNull()
            ?: return null
        for (candidate in interfaces) {
            if (!candidate.isUp || candidate.isLoopback) continue
            for (address in candidate.inetAddresses) {
                if (address is Inet4Address && address.isSiteLocalAddress) {
                    return address.hostAddress
                }
            }
        }
        return null
    }
}
