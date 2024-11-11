package app.digitus.savr.data.articles.impl

import app.digitus.savr.data.Result
import app.digitus.savr.data.articles.ArticlesRepository
import app.digitus.savr.model.Article
import app.digitus.savr.model.ArticlesFeed
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withContext

/**
 * Implementation of PostsRepository that returns a hardcoded list of
 * posts with resources synchronously.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class BlockingFakeArticlesRepository : ArticlesRepository {

    private val articlesFeed = MutableStateFlow<ArticlesFeed?>(null)

    override suspend fun getArticle(articleSlug: String?): Result<Article> {
        return withContext(Dispatchers.IO) {
            val article = articles.allArticles.find { it.slug == articleSlug }
            if (article == null) {
                Result.Error(IllegalArgumentException("Unable to find article"))
            } else {
                Result.Success(article)
            }
        }
    }

    override suspend fun getArticlesFeed(): Result<ArticlesFeed> {
        articlesFeed.update { articles }
        return Result.Success(articles)
    }

}
