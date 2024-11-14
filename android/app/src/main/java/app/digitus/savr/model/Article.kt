
package app.digitus.savr.model

import kotlinx.serialization.Serializable

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
    // link: string;
    // thumbnail: string;
    // isReadable: boolean;
    // isArchived: boolean;
    val infoForCard: String
)

data class ArticleAndRender(
    val article: Article,
    val extra: ArticleRenderExtra
)


@Serializable
data class Articles(
    var articles: MutableList<Article>
)
