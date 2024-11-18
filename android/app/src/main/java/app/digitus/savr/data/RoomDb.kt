import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.net.Uri
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase
import androidx.sqlite.db.SupportSQLiteOpenHelper
import app.digitus.savr.model.Article


// Define a DAO (Data Access Object) for database operations
@Dao
interface ArticleDao {
    @Query("SELECT * FROM Article")
    fun getAllArticles(): List<Article>

    @Insert
    fun insertArticle(article: Article)

    @Delete
    fun deleteArticle(article: Article)
}



@Database(entities = [Article::class], version = 1)
abstract class SavrDb : RoomDatabase() {
    abstract fun articleDao(): ArticleDao

    companion object {
        @Volatile
        private var INSTANCE: SavrDb? = null

        fun getInstance(context: Context): SavrDb {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    SavrDb::class.java,
                    "your-database-name"
                ).build()
                INSTANCE = instance
                instance
            }
        }
    }
}



class SAFSQLiteOpenHelper(
    private val context: Context,
    private val safUri: Uri,
    name: String?,
    version: Int,
    callback: RoomDatabase.Callback
) : SupportSQLiteOpenHelper {

    private val databasePath: String = name ?: "database.sqlite"
    private var database: SQLiteDatabase? = null

    override fun getWritableDatabase(): SupportSQLiteDatabase {
        if (database == null || !database!!.isOpen) {
            val parcelFileDescriptor = context.contentResolver.openFileDescriptor(safUri, "rw")
            parcelFileDescriptor?.let {
                val fileDescriptor = it.fileDescriptor
                database = SQLiteDatabase.openDatabase(fileDescriptor, null, SQLiteDatabase.OPEN_READWRITE)
            }
        }
        return FrameworkSQLiteDatabase(database!!)
    }

    override fun getReadableDatabase(): SupportSQLiteDatabase = getWritableDatabase()

    override fun close() {
        database?.close()
    }

    override fun getDatabaseName(): String = databasePath

    override fun setWriteAheadLoggingEnabled(enabled: Boolean) {
        database?.enableWriteAheadLogging()
    }
}


class SAFSQLiteHelperFactory(
    private val context: Context,
    private val safUri: Uri
) : SupportSQLiteOpenHelper.Factory {

    override fun create(configuration: SupportSQLiteOpenHelper.Configuration): SupportSQLiteOpenHelper {
        return SAFSQLiteOpenHelper(
            context = context,
            safUri = safUri,
            name = configuration.name,
            version = configuration.callback.version,
            callback = configuration.callback
        )
    }
}

fun setupRoomDatabase(uri: Uri) {
    val db = Room.databaseBuilder(
        applicationContext,
        SavrDb::class.java,
        "database-name" // Can be null since we're using SAF
    )
    .openHelperFactory(SAFSQLiteHelperFactory(applicationContext, uri))
    .build()

    // Use the database as usual
}





// use like so:
// val articleDao = SavrDb.getInstance(context).articleDao()
