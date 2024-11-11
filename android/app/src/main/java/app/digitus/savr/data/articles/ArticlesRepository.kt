
package app.digitus.savr.data.articles

import app.digitus.savr.data.Result
import app.digitus.savr.model.Article
import app.digitus.savr.model.ArticlesFeed

/**
 * Interface to the Articles data layer.
 */
interface ArticlesRepository {

    suspend fun getArticle(articleSlug: String?): Result<Article>

    suspend fun getArticlesFeed(): Result<ArticlesFeed>

    /**
     * Observe the posts feed.
     */
//    fun observeArticlesFeed(): Flow<ArticlesFeed?>

}
