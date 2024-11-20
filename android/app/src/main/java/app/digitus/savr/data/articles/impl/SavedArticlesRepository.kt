
package app.digitus.savr.data.articles.impl

import app.digitus.savr.data.JsonDb
import app.digitus.savr.data.Result
import app.digitus.savr.data.articles.ArticlesRepository
import app.digitus.savr.model.Article
import app.digitus.savr.model.ArticlesFeed
import app.digitus.savr.utils.DbCreationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withContext


class SavedArticlesRepository : ArticlesRepository {

    private val articlesFeed = MutableStateFlow<ArticlesFeed?>(null)

    override suspend fun getArticle(articleSlug: String?): Result<Article> {
        return withContext(Dispatchers.IO) {
            val article = articles.allArticles.find { it.slug == articleSlug }

            if (article == null) {
                Result.Error(IllegalArgumentException("Article not found"))
            } else {
                Result.Success(article)
            }
        }
    }

    override suspend fun getArticlesFeed(): Result<ArticlesFeed> {
        return withContext(Dispatchers.IO) {

            val myArticles = ArticlesFeed(all = mutableListOf())

            try {
                val everything = JsonDb(
                    app.digitus.savr.SavrApplication.appContext ?: error("App context is empty")
                ).getEverything()
                myArticles.all = everything

            } catch (e: DbCreationException) {
//                val everything = emptyList<Article>()
            }

            articlesFeed.update { myArticles }
            Result.Success(myArticles)

        }
    }

}
