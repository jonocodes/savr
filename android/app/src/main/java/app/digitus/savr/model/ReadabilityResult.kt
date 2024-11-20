package app.digitus.savr.model

import com.squareup.moshi.JsonClass
//import kotlinx.serialization.Serializable

//@Serializable
@JsonClass(generateAdapter = true)
data class ReadabilityResult(
    val byline: String?,
    val content: String?,
    val dir: String?,
    val excerpt: String?,
    val lang: String?,
    val length: String?,
    val publishedTime: String?,
    val siteName: String?,
    val textContent: String?,
    val title: String,
)
