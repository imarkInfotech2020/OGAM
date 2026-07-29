package ai.offgridmobile.directory

import android.net.Uri
import android.provider.DocumentsContract
import android.webkit.MimeTypeMap
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.time.Instant

class SyncDirectorySourceModule(
    private val context: ReactApplicationContext,
) : ReactContextBaseJavaModule(context) {
    override fun getName(): String = "SyncDirectorySourceModule"

    @ReactMethod
    fun enumerate(grant: String, promise: Promise) {
        try {
            val tree = Uri.parse(grant)
            val rootId = DocumentsContract.getTreeDocumentId(tree)
            val result = Arguments.createArray()
            enumerateChildren(tree, rootId, "", result)
            promise.resolve(result)
        } catch (error: Exception) {
            promise.reject("directory_enumeration_failed", error)
        }
    }

    @ReactMethod
    fun stage(grant: String, sourceId: String, destinationName: String, promise: Promise) {
        try {
            val tree = Uri.parse(grant)
            val document = DocumentsContract.buildDocumentUriUsingTree(tree, sourceId)
            val directory = File(context.filesDir, "shared_files/download").apply { mkdirs() }
            val destination = availableDestination(directory, destinationName)
            context.contentResolver.openInputStream(document).use { input ->
                requireNotNull(input) { "The selected file is no longer available." }
                destination.outputStream().use { output -> input.copyTo(output) }
            }
            promise.resolve(
                Arguments.createMap().apply {
                    putString("filePath", destination.absolutePath)
                    putString("name", destination.name)
                },
            )
        } catch (error: Exception) {
            promise.reject("directory_stage_failed", error)
        }
    }

    private fun enumerateChildren(
        tree: Uri,
        parentId: String,
        relativeParent: String,
        result: com.facebook.react.bridge.WritableArray,
    ) {
        val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parentId)
        val projection = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_SIZE,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED,
        )
        context.contentResolver.query(children, projection, null, null, null)?.use { cursor ->
            while (cursor.moveToNext()) {
                val documentId = cursor.getString(0)
                val name = cursor.getString(1) ?: continue
                val mimeType = cursor.getString(2) ?: "application/octet-stream"
                val relative = if (relativeParent.isEmpty()) name else "$relativeParent/$name"
                if (mimeType == DocumentsContract.Document.MIME_TYPE_DIR) {
                    enumerateChildren(tree, documentId, relative, result)
                    continue
                }
                val fileSize = if (cursor.isNull(3)) 0L else cursor.getLong(3)
                val modifiedAt = if (cursor.isNull(4)) 0L else cursor.getLong(4)
                val resolvedMime = if (mimeType == "application/octet-stream") {
                    MimeTypeMap.getSingleton()
                        .getMimeTypeFromExtension(name.substringAfterLast('.', ""))
                        ?: mimeType
                } else {
                    mimeType
                }
                result.pushMap(
                    Arguments.createMap().apply {
                        putString("sourceId", documentId)
                        putString("name", name)
                        putString("mimeType", resolvedMime)
                        putDouble("fileSize", fileSize.toDouble())
                        putString(
                            "createdAt",
                            Instant.ofEpochMilli(modifiedAt.coerceAtLeast(0L)).toString(),
                        )
                        putDouble("modifiedAt", modifiedAt.toDouble())
                    },
                )
            }
        }
    }

    private fun availableDestination(directory: File, requestedName: String): File {
        val safeName = File(requestedName).name
        require(safeName.isNotEmpty()) { "The selected file is no longer available." }
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
