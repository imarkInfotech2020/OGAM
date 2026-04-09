package ai.offgridmobile.download

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "downloads")
data class DownloadEntity(
    @PrimaryKey
    val id: Long,
    val url: String,
    val fileName: String,
    val modelId: String,
    val title: String,
    val destination: String,
    val totalBytes: Long,
    val downloadedBytes: Long,
    val status: DownloadStatus,
    val createdAt: Long,
    val error: String? = null,
)

enum class DownloadStatus {
    QUEUED, RUNNING, PAUSED, COMPLETED, FAILED, CANCELLED
}
