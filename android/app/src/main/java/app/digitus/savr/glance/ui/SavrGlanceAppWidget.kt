
package app.digitus.savr.glance.ui

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.unit.dp
import androidx.glance.ColorFilter
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.lazy.itemsIndexed
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import app.digitus.savr.R
import app.digitus.savr.data.successOr
import app.digitus.savr.model.Post
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class SavrGlanceAppWidget : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val application = context.applicationContext as app.digitus.savr.SavrApplication
        val articlesRepository = application.container.articlesRepository

        // Load data needed to render the composable.
        // The widget is configured to refresh periodically using the "android:updatePeriodMillis"
        // configuration, and during each refresh, the data is loaded here.
        // The repository can internally return cached results here if it already has fresh data.
        val initialPostsFeed = withContext(Dispatchers.IO) {
            articlesRepository.getArticlesFeed().successOr(null)
        }
//        val initialBookmarks: Set<String> = withContext(Dispatchers.IO) {
//            articlesRepository.observeFavorites().first()
//        }

        provideContent {
//            val scope = rememberCoroutineScope()
////            val bookmarks by articlesRepository.observeFavorites().collectAsState(initialBookmarks)
//            val articlesFeed by articlesRepository.observePostsFeed().collectAsState(initialPostsFeed)
//            val recommendedTopPosts =
//                articlesFeed?.let {
//                    listOf(it.highlightedPost) + it.recommendedPosts } ?: emptyList()
//
//            // Provide a custom color scheme if the SDK version doesn't support dynamic colors.
//            GlanceTheme(
//                colors = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
//                    GlanceTheme.colors
//                } else {
//                    JetnewsGlanceColorScheme.colors
//                }
//            ) {
//                JetnewsContent(
//                    articles = recommendedTopPosts,
//                    bookmarks = bookmarks,
//                    onToggleBookmark = { scope.launch { articlesRepository.toggleFavorite(it) } }
//                )
//            }
        }
    }

    @Composable
    private fun SavrContent(
        articles: List<Post>,
        bookmarks: Set<String>?,
        onToggleBookmark: (String) -> Unit
    ) {
        Column(
            modifier = GlanceModifier
                .background(GlanceTheme.colors.surface)
                .cornerRadius(24.dp)
        ) {
            Header(modifier = GlanceModifier.fillMaxWidth())
            // Set key for each size so that the onToggleBookmark lambda is called only once for the
            // active size.
            key(LocalSize.current) {
                Body(
                    modifier = GlanceModifier.fillMaxWidth(),
                    articles = articles,
                    bookmarks = bookmarks ?: setOf(),
                    onToggleBookmark = onToggleBookmark
                )
            }
        }
    }

    @Composable
    fun Header(modifier: GlanceModifier) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = modifier.padding(horizontal = 10.dp, vertical = 20.dp)
        ) {
            val context = LocalContext.current
            Image(
                provider = ImageProvider(R.drawable.icon_article_background),
                colorFilter = ColorFilter.tint(GlanceTheme.colors.primary),
                contentDescription = null,
                modifier = GlanceModifier.size(24.dp)
            )
            Spacer(modifier = GlanceModifier.width(8.dp))
            Image(
                contentDescription = context.getString(R.string.app_name),
                colorFilter = ColorFilter.tint(GlanceTheme.colors.onSurfaceVariant),
                provider = ImageProvider(R.drawable.icon_article_background)
            )
        }
    }

    @Composable
    fun Body(
        modifier: GlanceModifier,
        articles: List<Post>,
        bookmarks: Set<String>,
        onToggleBookmark: (String) -> Unit,
    ) {
//        val postLayout = LocalSize.current.toPostLayout()
        LazyColumn(modifier = modifier.background(GlanceTheme.colors.background)) {
            itemsIndexed(articles) { index, post ->
                Column(modifier = GlanceModifier.padding(horizontal = 14.dp)) {
//                    Post(
//                        post = post,
//                        bookmarks = bookmarks,
//                        onToggleBookmark = onToggleBookmark,
//                        modifier = GlanceModifier.fillMaxWidth().padding(15.dp),
//                        postLayout = postLayout,
//                    )
                    if (index < articles.lastIndex) {
                        Divider()
                    }
                }
            }
        }
    }
}
