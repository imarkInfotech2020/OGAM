package ai.offgridmobile.downloads

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.webkit.MimeTypeMap
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import java.io.File
import java.time.Instant

/**
 * The Downloads folder, read through MediaStore instead of the folder picker.
 *
 * Android 11 stopped letting `ACTION_OPEN_DOCUMENT_TREE` grant the Download directory at all - the
 * picker answers "For your safety, share another folder", which is the message users were getting.
 * So this device cannot offer downloads sharing through a folder grant, and MediaStore is the path
 * that exists: a media permission, no picker, and rows the system already indexes.
 *
 * The honest limit of that path, which the JavaScript side reports rather than hides: with a media
 * permission, MediaStore returns MEDIA in Download (images, video, audio). A PDF another app
 * downloaded is not media and is not visible without the folder grant Android now refuses or the
 * all-files permission Play restricts. So this shares your downloaded pictures and video, and says
 * so, instead of appearing to share everything and quietly missing half of it.
 */
class SyncDownloadsModule(
    private val context: ReactApplicationContext,
) : ReactContextBaseJavaModule(context) {
    override fun getName(): String = "SyncDownloadsModule"

    @ReactMethod
    fun hasPermission(promise: Promise) {
        promise.resolve(granted())
    }

    /** Media in the Download folder, newest first, in the shape the shared directory source expects. */
    @ReactMethod
    fun enumerate(promise: Promise) {
        if (!granted()) {
            promise.reject(
                "downloads_permission_missing",
                "Off Grid needs access to your media to share downloads.",
            )
            return
        }
        try {
            promise.resolve(collect())
        } catch (error: Exception) {
            promise.reject("downloads_enumeration_failed", error)
        }
    }

    /** Copy one row into the app so it stays shareable after the original is moved or deleted. */
    @ReactMethod
    fun stage(sourceId: String, destinationName: String, promise: Promise) {
        try {
            val directory = File(context.filesDir, "shared_files/download").apply { mkdirs() }
            val destination = availableDestination(directory, destinationName)
            context.contentResolver.openInputStream(Uri.parse(sourceId)).use { input ->
                requireNotNull(input) { "This download is no longer available." }
                destination.outputStream().use { output -> input.copyTo(output) }
            }
            promise.resolve(
                Arguments.createMap().apply {
                    putString("filePath", destination.absolutePath)
                    putString("name", destination.name)
                },
            )
        } catch (error: Exception) {
            promise.reject("downloads_stage_failed", error)
        }
    }

    private fun collect(): WritableArray {
        val result = Arguments.createArray()
        val collection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL)
        } else {
            @Suppress("DEPRECATION")
            MediaStore.Files.getContentUri("external")
        }
        val projection = arrayOf(
            MediaStore.MediaColumns._ID,
            MediaStore.MediaColumns.DISPLAY_NAME,
            MediaStore.MediaColumns.MIME_TYPE,
            MediaStore.MediaColumns.SIZE,
            MediaStore.MediaColumns.DATE_MODIFIED,
        )
        val selection: String
        val args: Array<String>
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            selection = "${MediaStore.MediaColumns.RELATIVE_PATH} LIKE ?"
            args = arrayOf("Download%")
        } else {
            @Suppress("DEPRECATION")
            selection = "${MediaStore.MediaColumns.DATA} LIKE ?"
            args = arrayOf("%/Download/%")
        }
        context.contentResolver.query(
            collection,
            projection,
            selection,
            args,
            "${MediaStore.MediaColumns.DATE_MODIFIED} DESC",
        )?.use { cursor ->
            while (cursor.moveToNext()) {
                val id = cursor.getLong(0)
                val name = cursor.getString(1) ?: continue
                val declaredMime = cursor.getString(2)
                val fileSize = if (cursor.isNull(3)) 0L else cursor.getLong(3)
                // Seconds in MediaStore, milliseconds everywhere the shared source compares times.
                val modifiedAt = (if (cursor.isNull(4)) 0L else cursor.getLong(4)) * 1000L
                result.pushMap(
                    Arguments.createMap().apply {
                        putString("sourceId", Uri.withAppendedPath(collection, id.toString()).toString())
                        putString("name", name)
                        putString("mimeType", resolveMime(declaredMime, name))
                        putDouble("fileSize", fileSize.toDouble())
                        putString("createdAt", Instant.ofEpochMilli(modifiedAt.coerceAtLeast(0L)).toString())
                        putDouble("modifiedAt", modifiedAt.toDouble())
                    },
                )
            }
        }
        return result
    }

    private fun resolveMime(declared: String?, name: String): String {
        if (declared != null && declared != "application/octet-stream") return declared
        val extension = name.substringAfterLast('.', "")
        return MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension.lowercase())
            ?: declared
            ?: "application/octet-stream"
    }

    private fun granted(): Boolean {
        val permissions = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            listOf(Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO)
        } else {
            listOf(Manifest.permission.READ_EXTERNAL_STORAGE)
        }
        // Either is enough to see something: a user who granted photos but not video should still get
        // their downloaded pictures rather than an unusable feature.
        return permissions.any {
            ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
        }
    }

    private fun availableDestination(directory: File, requestedName: String): File {
        val safeName = File(requestedName).name
        require(safeName.isNotEmpty()) { "This download is no longer available." }
        var destination = File(directory, safeName)
        val extension = destination.extension
        val stem = destination.nameWithoutExtension
        var suffix = 2
        while (destination.exists()) {
            val next = if (extension.isEmpty()) "$stem $suffix" else "$stem $suffix.$extension"
            destination = File(directory, next)
            suffix += 1
        }
        return destination
    }
}
