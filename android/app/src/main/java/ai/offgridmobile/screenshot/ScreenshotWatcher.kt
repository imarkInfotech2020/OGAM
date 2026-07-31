package ai.offgridmobile.screenshot

import android.content.ContentResolver
import android.content.Context
import android.database.ContentObserver
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Log
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
    private companion object {
        const val TAG = "SyncScreenshot"
        /** Enough to catch up after the app was away, without dumping a month of screenshots. */
        const val MAX_CATCH_UP = 20
    }

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
        Log.i(TAG, "watching from id=$lastSeenId")
    }

    private fun stop() {
        observer?.let { resolver.unregisterContentObserver(it) }
        observer = null
    }

    private fun newestScreenshotId(): Long? = query { cursor, _ -> cursor.getLong(0) }

    /**
     * Everything in the bucket newer than the last one shared, oldest first.
     *
     * Reading only the single newest row was wrong twice over. The screenshot service inserts its row
     * as PENDING and un-pends it once the bytes are written, and a pending row is invisible to other
     * apps - so the change notification arrived, the query answered with the PREVIOUS screenshot, the
     * id was not newer, and the capture was dropped. Nothing ever recovered it either, because a
     * single-row read cannot catch up on anything missed while the app was away.
     *
     * Asking for every row above a watermark is immune to both: a late notification still finds the
     * screenshot, and screenshots taken while the app was backgrounded arrive when it returns.
     */
    private fun captureNew() {
        val rows = screenshotsNewerThan(lastSeenId)
        if (rows.isEmpty()) return
        val batch = rows.take(MAX_CATCH_UP)
        if (rows.size > batch.size) {
            // Say what was skipped rather than let a silent cap read as "shared everything".
            Log.i(TAG, "capture batch=${batch.size} skipped=${rows.size - batch.size}")
        }
        for (row in batch) {
            lastSeenId = maxOf(lastSeenId, row.id)
            val copied = copyIntoApp(row)
            if (copied == null) {
                Log.w(TAG, "capture could not copy id=${row.id}")
                continue
            }
            Log.i(TAG, "capture emit id=${row.id} bytes=${row.fileSize}")
            onCaptured(copied)
        }
        // The watermark advances past a row that could not be copied too: retrying it on every
        // notification forever would be a loop, and the user can share it by hand.
        rows.forEach { lastSeenId = maxOf(lastSeenId, it.id) }
    }

    /**
     * The Screenshots bucket, filtered by the caller's clause.
     *
     * `RELATIVE_PATH` exists from API 29; below that the only locator is the file path, so the query
     * falls back to it rather than reporting no screenshots at all on an older device.
     */
    private fun bucketSelection(): Pair<String, Array<String>> {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // A row still being written is not shareable yet, and while pending it hides the real
            // newest screenshot from us.
            "${MediaStore.Images.Media.RELATIVE_PATH} LIKE ? AND " +
                "${MediaStore.MediaColumns.IS_PENDING} = 0" to arrayOf("%Screenshots%")
        } else {
            @Suppress("DEPRECATION")
            "${MediaStore.Images.Media.DATA} LIKE ?" to arrayOf("%Screenshots%")
        }
    }

    private fun screenshotsNewerThan(since: Long): List<Row> {
        val columns = Columns()
        val (bucket, bucketArgs) = bucketSelection()
        val selection = "$bucket AND ${MediaStore.Images.Media._ID} > ?"
        val args = bucketArgs + arrayOf(since.toString())
        return try {
            resolver.query(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                columns.projection,
                selection,
                args,
                "${MediaStore.Images.Media._ID} ASC",
            )?.use { cursor ->
                buildList {
                    while (cursor.moveToNext()) add(read(cursor, columns))
                }
            } ?: emptyList()
        } catch (error: SecurityException) {
            // No media permission: the capability is simply absent, not an error to surface here.
            Log.w(TAG, "query refused: no media permission")
            emptyList()
        }
    }

    private fun <T> query(read: (android.database.Cursor, Columns) -> T?): T? {
        val columns = Columns()
        val (selection, args) = bucketSelection()
        return try {
            resolver.query(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                columns.projection,
                selection,
                args,
                "${MediaStore.Images.Media._ID} DESC",
            )?.use { cursor -> if (cursor.moveToFirst()) read(cursor, columns) else null }
        } catch (error: SecurityException) {
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
