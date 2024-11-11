
package app.digitus.savr.data.articles.impl

import android.util.Log
import androidx.documentfile.provider.DocumentFile
import app.digitus.savr.SavrApplication.Companion.appSavesDir
import app.digitus.savr.data.Result
import app.digitus.savr.data.articles.ArticlesRepository
import app.digitus.savr.model.Article
import app.digitus.savr.model.ArticlesFeed
import app.digitus.savr.utils.LOGTAG
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withContext

/**
 * Implementation of ArticlesRepository that returns a hardcoded list of
 * articles with resources after some delay in a background thread.
 */
class DirectoryArticlesRepository : ArticlesRepository {

    private val articlesFeed = MutableStateFlow<ArticlesFeed?>(null)

    // Used to make suspend functions that read and update state safe to call from any thread

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
//            delay(800) // pretend we're on a slow network
//            if (shouldRandomlyFail()) {
//                Result.Error(IllegalStateException())
//            } else {

                val files: Array<DocumentFile> = appSavesDir?.listFiles() ?: arrayOf()
                Log.d(LOGTAG, files.map { it.name }.toString())

                val saves = mutableListOf<Article>()

                for (dir in files) {
                    val article = Article(
                        title=dir.name ?: "unknown",
                        slug = dir.name ?: "unknown",
                        url = "https://medium.com/androiddevelopers/gradle-path-configuration-dc523f0ed25c",
                        author = "John Doe",
                        readTimeMinutes = 10,
                        publishedDate = "August 24",
                        ingestDate = "rstarst",
                        ingestPlatform = "android (version?)",
                        mimeType = "text/html",
                        ingestSource = "url",
                    )
                    saves.add(article)
                }

                val myArticles = ArticlesFeed( all = saves )

                articlesFeed.update { myArticles }
                Result.Success(myArticles)
//            }
        }
    }

    // used to drive "random" failure in a predictable pattern, making the first request always
    // succeed
    private var requestCount = 0

    /**
     * Randomly fail some loads to simulate a real network.
     *
     * This will fail deterministically every 5 requests
     */
//    private fun shouldRandomlyFail(): Boolean = ++requestCount % 5 == 0
}
