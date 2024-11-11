
package app.digitus.savr

import android.content.Context
import app.digitus.savr.data.AppContainer
import app.digitus.savr.data.articles.ArticlesRepository
import app.digitus.savr.data.articles.impl.BlockingFakeArticlesRepository

class TestAppContainer(private val context: Context) : app.digitus.savr.data.AppContainer {

    override val articlesRepository: ArticlesRepository by lazy {
        BlockingFakeArticlesRepository()
    }

}
