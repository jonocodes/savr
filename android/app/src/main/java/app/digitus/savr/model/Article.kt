
package app.digitus.savr.model

import app.digitus.savr.data.moshi
import com.squareup.moshi.JsonClass
import com.squareup.moshi.JsonWriter

val articleJsonAdapter = moshi.adapter(Article::class.java)

@JsonClass(generateAdapter = true)
data class Article(
//    @PrimaryKey val id: Int,
    val slug: String,
    val title: String,
    val url: String?,   // this should probably be non null and unique?
    var state: String = "unread", // unread, reading, finished, archived, deleted, ingesting
    val publication: String? = null,
    val author: String? = null,
    val publishedDate: String? = null, // TODO: perhaps this should be a datetime object
    val ingestDate: String, // datetime iso
    var ingestPlatform: String, // typescript/web v 1.35
    val ingestSource: String, // url, raw
    val mimeType: String,
    val readTimeMinutes: Int? = null,
    val progress: Int = 0,
) {
//    fun publishedDateReadable(): String? {
////        TODO: make this nicer to read like "November 20, 2004", but localized
//        if (publishedDate == null) {
//            return null
//        }
//        val dt = parseReadabilityDate(publishedDate)
//
//        return dt?.format(DateTimeFormatter.ISO_LOCAL_DATE)
//    }
}

data class ArticleRenderExtra(
    val infoForCard: String,
    val fileName: String,
)

data class ArticleAndRender(
    val article: Article,
    val extra: ArticleRenderExtra
)

@JsonClass(generateAdapter = true)
data class DbRoot(
    var articles: MutableList<Article>
)

fun articleToJsonString(article: Article): String {
    val buffer = okio.Buffer()
    val jsonWriter = JsonWriter.of(buffer)
    jsonWriter.setIndent("  ") // Pretty print with indentation
    articleJsonAdapter.toJson(jsonWriter, article)
    return buffer.readUtf8()
}