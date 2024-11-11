package app.digitus.savr.model


data class ArticlesFeed(
    var all: MutableList<Article>,
) {
    val allArticles: List<Article> = all
}
