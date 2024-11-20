package app.digitus.savr.data

import android.content.Context
import android.util.Log
import app.digitus.savr.SavrApplication.Companion.appDataDir
import app.digitus.savr.SavrApplication.Companion.jsonDbFile
import app.digitus.savr.model.Article
import app.digitus.savr.model.DbRoot
import app.digitus.savr.utils.DbCreationException
import app.digitus.savr.utils.LOGTAG
import app.digitus.savr.utils.readTextFromUri
import app.digitus.savr.utils.setDirectories
import app.digitus.savr.utils.writeText
import com.squareup.moshi.JsonWriter
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory


const val DB_FILENAME = "db.json"

const val empty_saves_content = """{"articles" : []}"""



val moshi = Moshi.Builder()
    .add(KotlinJsonAdapterFactory()) // Required if using reflection
    .build()

val adapter = moshi.adapter(DbRoot::class.java)


class JsonDb(val context: Context) {

    init {

        if (appDataDir == null) {
            setDirectories(context)
        }

        if (appDataDir!=null && jsonDbFile == null) {
            jsonDbFile = appDataDir?.findFile(DB_FILENAME)

            if (jsonDbFile == null) {
                jsonDbFile = appDataDir?.createFile(
                    "application/json", DB_FILENAME
                ) ?: error("Error creating db file")

                if (jsonDbFile != null && (jsonDbFile ?: error("Db file is empty")).canWrite()) {

                    val written = writeText(context, (jsonDbFile ?: error("Db file is empty")).uri,
                        empty_saves_content
                    )
                    if (!written) {
                        throw AssertionError("Error writing to database")
                    }

                } else {
                    Log.d(LOGTAG, "Error creating database")
                    throw DbCreationException("Error creating database")
                }

            }
        }
    }

    fun getEverything() : MutableList<Article> {
        if (jsonDbFile == null) {
//            TODO: should probably make them set the dir first

            val root = adapter.fromJson(empty_saves_content) ?: error("no db")
            return root.articles
        }

        val fileString = readTextFromUri(context, (jsonDbFile ?: error("Db file is empty")).uri)

        try {
            val root = adapter.fromJson(fileString) ?: error("no db")
            return root.articles
        } catch (e: Exception) {
            throw AssertionError("JSON import issue", e)
        }
    }

    fun getReadable(): List<Article> {
        return getEverything().filter { it.state != "archived" && it.state != "deleted" }
    }

    fun getArchived(): List<Article> {
        return getEverything().filter { it.state == "archived" }
    }

    fun articleInDb(article: Article): Article? {
        return getEverything().find { it.slug == article.slug }
    }

    fun saveToDisk(articles: MutableList<Article>) {

        val root = DbRoot(articles=articles)
        val buffer = okio.Buffer()
        val jsonWriter = JsonWriter.of(buffer)
        jsonWriter.setIndent("  ") // Pretty print with indentation
        adapter.toJson(jsonWriter, root)
        val outString = buffer.readUtf8()

        writeText(context, (jsonDbFile ?: error("Db file is empty")).uri, outString)
    }

    fun addArticle(article: Article) {

        val articles = getEverything()

        if (articles.find { it.slug == article.slug } != null) {
            Log.d(LOGTAG, "skipping db add. article already exists: ${article.slug}")
            throw Exception("Article already exists")
        } else {
            articles.add(0, article)

            saveToDisk(articles)

            Log.d(LOGTAG,"Article added ${article.slug}")
        }
    }

    fun archiveArticle(article: Article, unarchive: Boolean = false) {

        val articles = getEverything()

        val articleIndex = articles.indexOfLast { it.slug == article.slug }

        if (articleIndex != -1) {
            if (unarchive) {
                articles[articleIndex].state = "unread"
            } else {
                articles[articleIndex].state = "archived"
            }

            saveToDisk(articles)

            Log.d(LOGTAG,"Article archived ${article.slug}")
        }
    }

    fun deleteArticle(article: Article) {

        val articles = getEverything()

        val articleIndex = articles.indexOfLast { it.slug == article.slug }

        if (articleIndex != -1) {
            articles.removeAt(articleIndex)

            saveToDisk(articles)

            Log.d(LOGTAG,"Article deleted ${article.slug}")
        }
    }


}
