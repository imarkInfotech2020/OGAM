package ai.offgridmobile.download

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface DownloadDao {
    @Query("SELECT * FROM downloads")
    fun getAllDownloads(): Flow<List<DownloadEntity>>

    @Query("SELECT * FROM downloads WHERE id = :downloadId")
    suspend fun getDownload(downloadId: Long): DownloadEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertDownload(download: DownloadEntity)

    @Delete
    suspend fun deleteDownload(download: DownloadEntity)

    @Query("UPDATE downloads SET downloadedBytes = :bytes, totalBytes = :totalBytes, status = :status WHERE id = :downloadId")
    suspend fun updateProgress(downloadId: Long, bytes: Long, totalBytes: Long, status: DownloadStatus)

    @Query("UPDATE downloads SET status = :status, error = :error WHERE id = :downloadId")
    suspend fun updateStatus(downloadId: Long, status: DownloadStatus, error: String? = null)
}
