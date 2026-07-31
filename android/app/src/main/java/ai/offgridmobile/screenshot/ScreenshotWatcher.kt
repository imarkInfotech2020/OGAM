package ai.offgridmobile.screenshot

import android.content.ContentResolver
import android.content.Context
import android.database.ContentObserver
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import java.io.File
import java.time.Instant
import java.util.UUID

/**
 * A screenshot the device just wrote, copied into the app so it can be shared.
 *
 * The same shape iOS emits (`SyncScreenshotModule.swift`), because the TypeScript owner and the
 * shared sync package take one descriptor, not one per platform.
 */
data class CapturedScreenshot(
    val syncId: String,
    val name: String,
    val mimeType: String,
    val filePath: String,
    val fileSize: Long,
    val createdAt: String,
    val width: Int,
    val height: Int,
)

/**
 * Watches the media store for new screenshots.
 *
 * Android has no "the user took a screenshot" notification the way iOS does, so the signal is the
 * MediaStore row the screenshot service writes. Filtering to the Screenshots bucket is what keeps
 * this from firing on every photo, and copying the bytes into the app's own files directory is what
 * makes the file shareable later: a MediaStore uri is not readable once the permission is revoked,
 * and the user may delete the original at any time.
 *
 * Deduplicated by MediaStore id, because one screenshot produces several change notifications while
 * the file is written and then indexed.
 */
class ScreenshotWatcher(
    private val context: Context,
    private val onCaptured: (CapturedScreenshot) -> Unit,
) {
    private val resolver: ContentResolver = context.contentResolver
    private var lastSeenId: Long = -1
    private var observer: ContentObserver? = null

    fun setEnabled(enabled: Boolean) {
        if (enabled) start() else stop()
    }

    private fun start() {
        if (observer != null) return
        // The newest existing screenshot is the baseline: enabling sharing must not retroactively
        // share the screenshots already on the device.
        lastSeenId = newestScreenshotId() ?: -1
        val next = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean, uri: Uri?) {
                captureNew()
            }
        }
        resolver.registerContentObserver(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            true,
            next,
        )
        observer = next
    }

    private fun stop() {
        observer?.let { resolver.unregisterContentObserver(it) }
        observer = null
    }

    private fun newestScreenshotId(): Long? = query { cursor, _ -> cursor.getLong(0) }

    private fun captureNew() {
        val captured = query { cursor, columns -> read(cursor, columns) } ?: return
        if (captured.id <= lastSeenId) return
        lastSeenId = captured.id
        val copied = copyIntoApp(captured) ?: return
        onCaptured(copied)
    }

    /**
     * The newest rows in the Screenshots bucket.
     *
     * `RELATIVE_PATH` exists from API 29; below that the only locator is the file path, so the query
     * falls back to it rather than reporting no screenshots at all on an older device.
     */
    private fun <T> query(read: (android.database.Cursor, Columns) -> T?): T? {
        val columns = Columns()
        val selection: String
        val args: Array<String>
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            selection = "${MediaStore.Images.Media.RELATIVE_PATH} LIKE ?"
            args = arrayOf("%Screenshots%")
        } else {
            @Suppress("DEPRECATION")
            selection = "${MediaStore.Images.Media.DATA} LIKE ?"
            args = arrayOf("%Screenshots%")
        }
        // Newest first; only the first row is read. No LIMIT clause - MediaStore is not obliged to
        // honour one inside the sort order, and reading one row costs the same.
        val order = "${MediaStore.Images.Media.DATE_ADDED} DESC"
        return try {
            resolver.query(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                columns.projection,
                selection,
                args,
                order,
            )?.use { cursor -> if (cursor.moveToFirst()) read(cursor, columns) else null }
        } catch (error: SecurityException) {
            // No media permission: the capability is simply absent, not an error to surface here.
            null
        }
    }

    private fun read(cursor: android.database.Cursor, columns: Columns): Row {
        val id = cursor.getLong(0)
        return Row(
            id = id,
            uri = Uri.withAppendedPath(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id.toString()),
            name = cursor.getString(1) ?: "Screenshot.png",
            mimeType = cursor.getString(2) ?: "image/png",
            fileSize = if (cursor.isNull(3)) 0L else cursor.getLong(3),
            takenAtSeconds = if (cursor.isNull(4)) 0L else cursor.getLong(4),
            width = if (cursor.isNull(5)) 0 else cursor.getInt(5),
            height = if (cursor.isNull(6)) 0 else cursor.getInt(6),
        )
    }

    private fun copyIntoApp(row: Row): CapturedScreenshot? {
        val syncId = UUID.randomUUID().toString().lowercase()
        val extension = row.name.substringAfterLast('.', "png")
        val name = "Screenshot-$syncId.$extension"
        val directory = File(context.filesDir, "sync_screenshots").apply { mkdirs() }
        val destination = File(directory, name)
        return try {
            resolver.openInputStream(row.uri).use { input ->
                if (input == null) return null
                destination.outputStream().use { output -> input.copyTo(output) }
            }
            CapturedScreenshot(
                syncId = syncId,
                name = name,
                mimeType = row.mimeType,
                filePath = destination.absolutePath,
                fileSize = destination.length(),
                createdAt = Instant.ofEpochSecond(row.takenAtSeconds.coerceAtLeast(0L)).toString(),
                width = row.width,
                height = row.height,
            )
        } catch (error: Exception) {
            // A screenshot that cannot be copied has no transferable file, so there is nothing to
            // announce. The TypeScript owner keeps queue and error state for files that do exist.
            destination.delete()
            null
        }
    }

    internal data class Row(
        val id: Long,
        val uri: Uri,
        val name: String,
        val mimeType: String,
        val fileSize: Long,
        val takenAtSeconds: Long,
        val width: Int,
        val height: Int,
    )

    internal class Columns {
        val projection = arrayOf(
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.MIME_TYPE,
            MediaStore.Images.Media.SIZE,
            MediaStore.Images.Media.DATE_ADDED,
            MediaStore.Images.Media.WIDTH,
            MediaStore.Images.Media.HEIGHT,
        )
    }
}
