package ai.offgridmobile.download

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "downloads")
data class DownloadEntity(
    @PrimaryKey
    val id: String,
    val url: String,
    val fileName: String,
    val modelId: String,
    val destination: String,
    val totalBytes: Long,
    val downloadedBytes: Long,
    val status: DownloadStatus,
    val createdAt: Long,
    val error: String? = null,
    val expectedSha256: String? = null,
    // v3 columns
    val modelType: String = "text",
    val modelKey: String? = null,
    val quantization: String? = null,
    val combinedTotalBytes: Long = 0L,
    val mmProjDownloadId: String? = null,
    val metadataJson: String? = null,
)

enum class DownloadStatus {
    QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED
}
