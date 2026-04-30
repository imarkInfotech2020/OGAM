package ai.offgridmobile.download

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [DownloadEntity::class],
    version = 3,
    exportSchema = false,
)
abstract class DownloadDatabase : RoomDatabase() {
    abstract fun downloadDao(): DownloadDao

    companion object {
        private const val DATABASE_NAME = "downloads.db"

        @Volatile
        private var INSTANCE: DownloadDatabase? = null

        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("ALTER TABLE downloads ADD COLUMN expectedSha256 TEXT")
            }
        }

        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(database: SupportSQLiteDatabase) {
                // id column changed from INTEGER (Long) to TEXT (UUID string), and PAUSED status
                // was removed. We can't ALTER a primary key type in SQLite, so recreate the table.
                database.execSQL("""
                    CREATE TABLE IF NOT EXISTS downloads_new (
                        id TEXT NOT NULL PRIMARY KEY,
                        url TEXT NOT NULL,
                        fileName TEXT NOT NULL,
                        modelId TEXT NOT NULL,
                        destination TEXT NOT NULL,
                        totalBytes INTEGER NOT NULL,
                        downloadedBytes INTEGER NOT NULL,
                        status TEXT NOT NULL,
                        createdAt INTEGER NOT NULL,
                        error TEXT,
                        expectedSha256 TEXT,
                        modelType TEXT NOT NULL DEFAULT 'text',
                        modelKey TEXT,
                        quantization TEXT,
                        combinedTotalBytes INTEGER NOT NULL DEFAULT 0,
                        mmProjDownloadId TEXT,
                        metadataJson TEXT
                    )
                """.trimIndent())
                // Copy rows, coercing INTEGER id to TEXT, dropping PAUSED rows (enum removed).
                database.execSQL("""
                    INSERT INTO downloads_new (
                        id, url, fileName, modelId, destination,
                        totalBytes, downloadedBytes, status, createdAt,
                        error, expectedSha256
                    )
                    SELECT
                        CAST(id AS TEXT), url, fileName, modelId, destination,
                        totalBytes, downloadedBytes, status, createdAt,
                        error, expectedSha256
                    FROM downloads
                    WHERE status != 'PAUSED'
                """.trimIndent())
                database.execSQL("DROP TABLE downloads")
                database.execSQL("ALTER TABLE downloads_new RENAME TO downloads")
            }
        }

        fun getInstance(context: Context): DownloadDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    DownloadDatabase::class.java,
                    DATABASE_NAME,
                ).addMigrations(MIGRATION_1_2, MIGRATION_2_3)
                    .fallbackToDestructiveMigration()
                    .build().also { INSTANCE = it }
            }
        }
    }
}
