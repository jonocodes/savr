
package app.digitus.savr.model

import app.digitus.savr.utils.parseReadabilityDate
import kotlinx.serialization.Serializable
import java.net.URI
import java.time.format.DateTimeFormatter

@Serializable
data class Article(
    val slug: String,
    val title: String,
    val url: String?,
    var state: String = "unread", // unread, reading, finished, archived, deleted, ingesting
    val publication: String? = null,
    val author: String? = null,
    val publishedDate: String? = null, // TODO: perhaps this should be a datetime object
    val ingestDate: String, // datetime iso
    val ingestPlatform: String, // typescript/web v 1.35
    val ingestSource: String, // url, raw
    val mimeType: String,
    val readTimeMinutes: Int? = null,
    val progress: Int = 0,
) {

    fun isArchived(): Boolean {
        return state == "archived"
    }

    fun domain(): String {
        val uri = URI(url)
        val domain: String = uri.host
        return domain.removePrefix("www.")
    }

    fun byline(): String {
        if (author == null) {
            return domain()
        }
        return author
    }

    fun publishedDateReadable(): String? {

//        TODO: make this nicer to read like "November 20, 2004", but localized

        if (publishedDate == null) {
            return null
        }

        val dt = parseReadabilityDate(publishedDate)

        return dt?.format(DateTimeFormatter.ISO_LOCAL_DATE)
    }

}

@Serializable
data class Articles(
    var articles: MutableList<Article>
)
