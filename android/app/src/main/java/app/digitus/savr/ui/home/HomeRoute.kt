
package app.digitus.savr.ui.home

import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat.startActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.digitus.savr.ui.article.ArticleScreen
import app.digitus.savr.utils.getContentFile
import java.lang.AssertionError

/**
 * Displays the Home route.
 *
 * Note: AAC ViewModels don't work with Compose Previews currently.
 *
 * @param homeViewModel ViewModel that handles the business logic of this screen
 * @param isExpandedScreen (state) whether the screen is expanded
 * @param snackbarHostState (state) state for the [Scaffold] component on this screen
 */
@Composable
fun HomeRoute(
    homeViewModel: HomeViewModel,
    snackbarHostState: SnackbarHostState = remember { SnackbarHostState() }
) {
    // UiState of the HomeScreen
    val uiState by homeViewModel.uiState.collectAsStateWithLifecycle()

    val lifecycleOwner: LifecycleOwner = LocalLifecycleOwner.current

    // The current value of the composable's state is captured by rememberUpdatedState.
    val onResumeAction by rememberUpdatedState {
        // Action to trigger when the Composable is RESUMED
        // You can trigger anything you need here
        println("HomeRoute resumed and ready")
        homeViewModel.refreshArticles()
    }

    DisposableEffect(lifecycleOwner) {
        // Create a LifecycleObserver to listen for the ON_RESUME event
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                onResumeAction() // Trigger action when RESUMED
            }
        }

        // Add the observer to the lifecycle
        lifecycleOwner.lifecycle.addObserver(observer)

        // When the effect leaves the composition, remove the observer
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    HomeRoute(
        uiState = uiState,
        onSelectArticle = {  homeViewModel.selectArticle(it)  },
//        onDeleteArticle = {
//           homeViewModel.deleteArticle(it)
//        },
        onRefreshPosts = { homeViewModel.refreshArticles() },
        onErrorDismiss = { homeViewModel.errorShown(it) },
        onInteractWithFeed = {
            homeViewModel.refreshArticles()
            homeViewModel.interactedWithFeed()
                             },
//        onInteractWithArticleDetails = { homeViewModel.interactedWithArticleDetails(it) },
        snackbarHostState = snackbarHostState,
        onChangeMode = { homeViewModel.changeMode(it) },
        onScrapeAssets = {
//            homeViewModel.viewScrapeReadabilityAssets(result = String.toString()?, url = String )
            result, url, onProgress -> homeViewModel.viewScrapeReadabilityAssets(result, url, onProgress)
//            homeViewModel.viewScrapeReadabilityAssets(result: String?)

                         },
    )
}

/**
 * Displays the Home route.
 *
 * This composable is not coupled to any specific state management.
 *
 * @param uiState (state) the data to show on the screen
 * @param isExpandedScreen (state) whether the screen is expanded
 * @param onToggleFavorite (event) toggles favorite for a post
 * @param onSelectArticle (event) indicate that a post was selected
 * @param onRefreshPosts (event) request a refresh of posts
 * @param onErrorDismiss (event) error message was shown
 * @param onInteractWithFeed (event) indicate that the feed was interacted with
 * @param onInteractWithArticleDetails (event) indicate that the article details were interacted
 * with
 * @param snackbarHostState (state) state for the [Scaffold] component on this screen
 */
@Composable
fun HomeRoute(
    uiState: HomeUiState,
    onSelectArticle: (String) -> Unit,
    onRefreshPosts: () -> Unit,
    onErrorDismiss: (Long) -> Unit,
    onInteractWithFeed: () -> Unit,
    snackbarHostState: SnackbarHostState,
    onChangeMode: (String) -> Unit,
    onScrapeAssets: (String?, String, (Int, String) -> Unit) -> Unit,
) {
    // Construct the lazy list states for the list and the details outside of deciding which one to
    // show. This allows the associated state to survive beyond that decision, and therefore
    // we get to preserve the scroll throughout any changes to the content.
    val homeListLazyListState = rememberLazyListState()

    val homeScreenType = getHomeScreenType(uiState)
    when (homeScreenType) {
        HomeScreenType.Feed -> {
            HomeFeedScreen(
                uiState = uiState,
                onSelectPost = onSelectArticle,
                onRefreshPosts = onRefreshPosts,
                onErrorDismiss = onErrorDismiss,
                homeListLazyListState = homeListLazyListState,
                snackbarHostState = snackbarHostState,
                onChangeMode = onChangeMode,
                onScrapeAssets = onScrapeAssets,
            )
        }
        HomeScreenType.ArticleDetails -> {
            // Guaranteed by above condition for home screen type
            check(uiState is HomeUiState.HasPosts)

            if (uiState.selectedArticle.mimeType == "text/html") {
                ArticleScreen(
                    article = uiState.selectedArticle,
                    onBack = onInteractWithFeed,
                )
            } else {

                // for now, it they have something like a pdf, use the default viewer
                val context = LocalContext.current

                var uri = getContentFile(uiState.selectedArticle)?.uri

                if (uri == null)
                    throw AssertionError("file not found")

                val intent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, uiState.selectedArticle.mimeType)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                startActivity(context, intent, null)
            }

            // If we are just showing the detail, have a back press switch to the list.
            // This doesn't take anything more than notifying that we "interacted with the list"
            // since that is what drives the display of the feed
            BackHandler {
                onInteractWithFeed()
            }
        }
    }
}

/**
 * A precise enumeration of which type of screen to display at the home route.
 *
 * There are 3 options:
 * - [FeedWithArticleDetails], which displays both a list of all articles and a specific article.
 * - [Feed], which displays just the list of all articles
 * - [ArticleDetails], which displays just a specific article.
 */
private enum class HomeScreenType {
    Feed,
    ArticleDetails
}

/**
 * Returns the current [HomeScreenType] to display, based on whether or not the screen is expanded
 * and the [HomeUiState].
 */
@Composable
private fun getHomeScreenType(
    uiState: HomeUiState
): HomeScreenType = when (false) {
    false -> {
        when (uiState) {
            is HomeUiState.HasPosts -> {
                if (uiState.isArticleOpen) {
                    HomeScreenType.ArticleDetails
                } else {
                    HomeScreenType.Feed
                }
            }
            is HomeUiState.NoPosts -> HomeScreenType.Feed
        }
    }
    true -> HomeScreenType.Feed
}
