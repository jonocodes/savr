package app.digitus.savr.model

import kotlinx.serialization.Serializable

@Serializable
data class ReadabilityResult(
    val byline: String?,
    val content: String?,
    val dir: String?,
    val excerpt: String?,
    val lang: String?,
    val length: String?,
    val publishedTime: String?,  // TODO: use json5 to store an actual date?
    val siteName: String?,
    val textContent: String?,
    val title: String,
)
