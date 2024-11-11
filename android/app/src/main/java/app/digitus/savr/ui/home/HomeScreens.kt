package app.digitus.savr.ui.home

import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.http.SslError
import android.util.Log
import android.view.View.INVISIBLE
import android.view.ViewGroup
import android.webkit.SslErrorHandler
import android.webkit.ValueCallback
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.paddingFromBaseline
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCircleOutline
import androidx.compose.material.icons.filled.Inventory
import androidx.compose.material.icons.filled.PermMedia
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Card
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.TopAppBarScrollBehavior
import androidx.compose.material3.TopAppBarState
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshState
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.material3.rememberTopAppBarState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.core.content.ContextCompat.startActivity
import app.digitus.savr.BuildConfig
import app.digitus.savr.R
import app.digitus.savr.data.JsonDb
import app.digitus.savr.model.Article
import app.digitus.savr.ui.SettingsActivity
import app.digitus.savr.ui.components.SavrSnackbarHost
import app.digitus.savr.utils.JS_SCRIPT_READABILITY
import app.digitus.savr.utils.LOGTAG
import app.digitus.savr.utils.PREFS_KEY_DATADIR
import app.digitus.savr.utils.prefsGetString
import app.digitus.savr.utils.readFromAsset
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.isActive
import java.io.ByteArrayInputStream

val sampleArticleUrls = setOf(
    "https://www.apalrd.net/posts/2023/network_ipv6/",
    "https://getpocket.com/explore/item/is-matter-conscious",
    "https://medium.com/androiddevelopers/jetnews-for-every-screen-4d8e7927752",
    "https://theconversation.com/records-of-pompeiis-survivors-have-been-found-and-archaeologists-are-starting-to-understand-how-they-rebuilt-their-lives-230641",
    "https://en.m.wikipedia.org/wiki/Dune:_Part_Two",
    "https://lifehacker.com/home/how-to-make-more-kitchen-counter-space", // has svg
    "http://leejo.github.io/2024/09/01/off_by_one/", // no ssl
    "https://www.troyhunt.com/inside-the-3-billion-people-national-public-data-breach/",
    "https://medium.com/airbnb-engineering/rethinking-text-resizing-on-web-1047b12d2881",
    "https://leejo.github.io/2024/09/29/holding_out_for_the_heros_to_fuck_off/",
)

/**
 * A [Modifier] that tracks all input, and calls [block] every time input is received.
 */
private fun Modifier.notifyInput(block: () -> Unit): Modifier =
    composed {
        val blockState = rememberUpdatedState(block)
        pointerInput(Unit) {
            while (currentCoroutineContext().isActive) {
                awaitPointerEventScope {
                    awaitPointerEvent(PointerEventPass.Initial)
                    blockState.value()
                }
            }
        }
    }

/**
 * The home screen displaying just the article feed.
 */
@Composable
fun HomeFeedScreen(
    uiState: HomeUiState,
    onSelectPost: (String) -> Unit,
    onRefreshPosts: () -> Unit,
    onErrorDismiss: (Long) -> Unit,
    homeListLazyListState: LazyListState,
    snackbarHostState: SnackbarHostState,
    modifier: Modifier = Modifier,
//    mode: String,
    onChangeMode: (String) -> Unit,
    onScrapeAssets: (String?, String, (Int, String) -> Unit) -> Unit,
) {
    HomeScreenWithList(
        uiState = uiState,
        onRefreshPosts = onRefreshPosts,
        onErrorDismiss = onErrorDismiss,
        snackbarHostState = snackbarHostState,
        modifier = modifier,
        onChangeMode = onChangeMode,
        onScrapeAssets = onScrapeAssets,
    ) { hasPostsUiState, contentPadding, contentModifier ->

//        val lifecycleOwner: LifecycleOwner = LocalLifecycleOwner.current
//
//        // The current value of the composable's state is captured by rememberUpdatedState.
//        val onResumeAction by rememberUpdatedState {
//            // Action to trigger when the Composable is RESUMED
//            // You can trigger anything you need here
//            println("HomeFieldScreen resumed and ready")
//            onRefreshPosts()
//        }
//
//        DisposableEffect(lifecycleOwner) {
//            // Create a LifecycleObserver to listen for the ON_RESUME event
//            val observer = LifecycleEventObserver { _, event ->
//                if (event == Lifecycle.Event.ON_RESUME) {
//                    onResumeAction() // Trigger action when RESUMED
//                }
//            }
//
//            // Add the observer to the lifecycle
//            lifecycleOwner.lifecycle.addObserver(observer)
//
//            // When the effect leaves the composition, remove the observer
//            onDispose {
//                lifecycleOwner.lifecycle.removeObserver(observer)
//            }
//        }

        ArticleList(
            onArticleTapped = onSelectPost,
            contentPadding = contentPadding,
            modifier = contentModifier,
            state = homeListLazyListState,
//            articlesFeed = hasPostsUiState.articlesFeed,
//            articles = hasPostsUiState.articlesReadable ,
            articles = if (uiState.mode == "archive") hasPostsUiState.articlesArchived else hasPostsUiState.articlesReadable,
            onRefreshPosts = onRefreshPosts,
            mode = uiState.mode  //mode,
        )
    }
}

private fun SetupRequiredAlert(context: Context) {

    val alertBuilder: AlertDialog.Builder = AlertDialog.Builder(context)

    alertBuilder.setTitle("Setup required")
        .setMessage("Please choose a data directory in settings.")
        .setPositiveButton("Open settings") { dialog, which ->
            val mainActivityIntent = Intent(
                context, SettingsActivity::class.java
            )
            startActivity(context, mainActivityIntent, null)
        }.create().show()
}

/**
 * A display of the home screen that has the list.
 *
 * This sets up the scaffold with the top app bar, and surrounds the [hasPostsContent] with refresh,
 * loading and error handling.
 *
 * This helper functions exists because [HomeFeedWithArticleDetailsScreen] and [HomeFeedScreen] are
 * extremely similar, except for the rendered content when there are posts to display.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HomeScreenWithList(
    uiState: HomeUiState,
    onRefreshPosts: () -> Unit,
    onErrorDismiss: (Long) -> Unit,
    onChangeMode: (String) -> Unit,
    snackbarHostState: SnackbarHostState,
    modifier: Modifier = Modifier,
    onScrapeAssets: (String?, String, (Int, String) -> Unit) -> Unit,
    hasPostsContent: @Composable (
        uiState: HomeUiState.HasPosts,
        contentPadding: PaddingValues,
        modifier: Modifier
    ) -> Unit,
) {
    val topAppBarState = rememberTopAppBarState()
    val scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior(topAppBarState)
    val pullToRefreshState = rememberPullToRefreshState()

    Scaffold(
        snackbarHost = { SavrSnackbarHost(hostState = snackbarHostState) },
        topBar = {
            HomeTopAppBar(
                topAppBarState = topAppBarState,
                onRefreshPosts = onRefreshPosts,
                onChangeMode = onChangeMode,
                onScrapeAssets = onScrapeAssets,
            )
        },
        modifier = modifier
    ) { innerPadding ->
        val contentModifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection)

        val context = LocalContext.current

        val alertBuilder: AlertDialog.Builder = AlertDialog.Builder(context)

        LoadingContent(
            empty = when (uiState) {
                is HomeUiState.HasPosts -> false
                is HomeUiState.NoPosts -> uiState.isLoading //|| !uiState.configured
            },
            emptyContent = { FullScreenLoading() },
            loading = uiState.isLoading,
            onRefresh = onRefreshPosts,
            state = pullToRefreshState,
            content = {
                when (uiState) {
                    is HomeUiState.HasPosts ->
                        hasPostsContent(uiState, innerPadding, contentModifier)

                    is HomeUiState.NoPosts -> {

                        if (!uiState.configured && prefsGetString(
                                context,
                                PREFS_KEY_DATADIR
                            ) == null
                        ) {
                            SetupRequiredAlert(context)

                            Row(
                                Modifier
                                    .fillMaxHeight()
                                    .fillMaxSize()) {

                                Text(
                                    text = "Data directory has not been set.\nPlease choose one in preferences.",
                                    style = MaterialTheme.typography.titleMedium,
//                    maxLines = 3,
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .paddingFromBaseline(top = 220.dp)
                                        .align(Alignment.CenterVertically),
                                    textAlign = TextAlign.Center,
                                    lineHeight = 30.sp,
                                )

                                IconButton(onClick = {

                                    val mainActivityIntent = Intent(
                                        context, SettingsActivity::class.java
                                    )
                                    startActivity(context, mainActivityIntent, null)
                                }) {
                                    Icon(
                                        imageVector = Icons.Filled.Settings,
                                        contentDescription = stringResource(R.string.settings)
                                    )
                                }

                            }

                        } else if (uiState.errorMessages.isEmpty()) {
                            // if there are no posts, and no error, let the user refresh manually
                            TextButton(
                                onClick = onRefreshPosts,
                                modifier
                                    .padding(innerPadding)
                                    .fillMaxSize()
                            ) {
                                Text(
                                    stringResource(id = R.string.home_tap_to_load_content),
                                    textAlign = TextAlign.Center
                                )
                            }
                        } else {
                            // there's currently an error showing, don't show any content
                            Box(
                                contentModifier
                                    .padding(innerPadding)
                                    .fillMaxSize()
                            ) { /* empty screen */ }
                        }
                    }
                }
            }
        )
    }

    // Process one error message at a time and show them as Snackbars in the UI
    if (uiState.errorMessages.isNotEmpty()) {
        // Remember the errorMessage to display on the screen
        val errorMessage = remember(uiState) { uiState.errorMessages[0] }

        // Get the text to show on the message from resources
        val errorMessageText: String = stringResource(errorMessage.messageId)
        val retryMessageText = stringResource(id = R.string.retry)

        // If onRefreshPosts or onErrorDismiss change while the LaunchedEffect is running,
        // don't restart the effect and use the latest lambda values.
        val onRefreshPostsState by rememberUpdatedState(onRefreshPosts)
        val onErrorDismissState by rememberUpdatedState(onErrorDismiss)

        // Effect running in a coroutine that displays the Snackbar on the screen
        // If there's a change to errorMessageText, retryMessageText or snackbarHostState,
        // the previous effect will be cancelled and a new one will start with the new values
        LaunchedEffect(errorMessageText, retryMessageText, snackbarHostState) {
            val snackbarResult = snackbarHostState.showSnackbar(
                message = errorMessageText,
                actionLabel = retryMessageText
            )
            if (snackbarResult == SnackbarResult.ActionPerformed) {
                onRefreshPostsState()
            }
            // Once the message is displayed and dismissed, notify the ViewModel
            onErrorDismissState(errorMessage.id)
        }
    }
}

/**
 * Display an initial empty state or swipe to refresh content.
 *
 * @param empty (state) when true, display [emptyContent]
 * @param emptyContent (slot) the content to display for the empty state
 * @param loading (state) when true, display a loading spinner over [content]
 * @param onRefresh (event) event to request refresh
 * @param content (slot) the main content to show
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LoadingContent(
    empty: Boolean,
    emptyContent: @Composable () -> Unit,
    loading: Boolean,
    onRefresh: () -> Unit,
    state: PullToRefreshState,
    content: @Composable () -> Unit
) {

//    val pullRefreshState = rememberPullRefreshState(loading, { onRefresh() })

    if (empty) {
        emptyContent()
    } else {
        PullToRefreshBox (
            state = state,
            onRefresh = onRefresh,
            isRefreshing = loading,
        ) {
            content()
        }
    }
}

/**
 * Display a feed of posts.
 *
 * When a post is clicked on, [onArticleTapped] will be called.
 *
 * @param postsFeed (state) the feed to display
 * @param onArticleTapped (event) request navigation to Article screen
 * @param modifier modifier for the root element
 */
@Composable
private fun ArticleList(
    onArticleTapped: (postId: String) -> Unit,
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues = PaddingValues(0.dp),
    state: LazyListState = rememberLazyListState(),
//    articlesFeed: ArticlesFeed,
    articles: List<Article>,
    onRefreshPosts: () -> Unit,
    mode: String,
) {

    val context = LocalContext.current

    LazyColumn(
        modifier = modifier,
        contentPadding = contentPadding,
//        state = state
    ) {

        if (articles.isNotEmpty()) {
            item {
                ArticleListSimpleSection(
                    articles = articles,
                    navigateToArticle = onArticleTapped,
                    mode = mode,
//                    navigateToArticle = {
//                        val articleActivityIntent = Intent(
//                            context, ArticleActivity::class.java
//                        )
//
//                        articleActivityIntent.putExtra("slug", "i-spent-a-week-without-ipv4-to-understand-ipv6-transition-mechan")
//
//                        startActivity(context, articleActivityIntent, null)
//                    },
//                    favorites = setOf(),
//                    onToggleFavorite = {},
                    onRefreshPosts = onRefreshPosts,
                )
            }
        } else {
            item {

                Row(
                    Modifier
                        .fillMaxHeight()
                        .fillMaxSize()) {

                    var text =
                        "There are no articles saved in your library. \nAdd one using the button above \nor share a URL from another app to Savr."

                    if (mode == "archive") {
                        text = "Archive is empty"
                    }

                    Text(
                        text = text,
                        style = MaterialTheme.typography.titleMedium,
//                    maxLines = 3,
                        modifier = Modifier
                            .fillMaxSize()
                            .paddingFromBaseline(top = 120.dp)
                            .align(Alignment.CenterVertically),
                        textAlign = TextAlign.Center,
                        lineHeight = 30.sp,
                    )
                }
            }

        }
    }
}

/**
 * Full screen circular progress indicator
 */
@Composable
private fun FullScreenLoading() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .wrapContentSize(Alignment.Center)
    ) {
        CircularProgressIndicator()
    }
}

@Composable
private fun ArticleListSimpleSection(
    articles: List<Article>,
    navigateToArticle: (String) -> Unit,
    onRefreshPosts: () -> Unit,
    mode: String,
) {
    Column {
        articles.forEach { article ->
            ArticleCardSimple(
                article = article,
                navigateToArticle = navigateToArticle,
                onRefreshPosts = onRefreshPosts,
                mode = mode
            )

            HorizontalDivider(
                modifier = Modifier.padding(horizontal = 14.dp),
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f)
            )
        }
    }
}


@Composable
fun ScraperWebView(
    url: String? = null,
    onProgress: (Int, String) -> Unit,
    onScrapeAssets: (String?, String, (Int, String) -> Unit) -> Unit,
) {

    val context = LocalContext.current

    val excludeExtensions = setOf("css", "js", "ttf", "ico", "gif", "png", "jpeg", "jpg", "webp", "svg")

    val webViewClient1 = object : WebViewClient() {

        override fun shouldInterceptRequest(
            view: WebView?,
            request: WebResourceRequest?
        ): WebResourceResponse? {

            // we really only want the html content at this step, so skip the others

            Log.d(LOGTAG, "scrape load intercept ${request?.url}")

            if (request?.requestHeaders?.get("Accept")?.contains("html") == true) {
                return super.shouldInterceptRequest(view, request)
            }

            val extension = request?.url?.toString()?.substringAfterLast('.', "")?.lowercase() ?: ""

            if (excludeExtensions.contains(extension)) {
                 Log.d(LOGTAG, "skipping via extension match: $extension")
                return WebResourceResponse("text/plain", "UTF-8", ByteArrayInputStream("".toByteArray()))
            }

            // example match here is Accept: '*/*' with no file extension
            return super.shouldInterceptRequest(view, request)
        }

        override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
            onProgress(20, "fetching content")
            super.onPageStarted(view, url, favicon)
        }

        override fun onReceivedError(
            view: WebView?,
            request: WebResourceRequest?,
            error: WebResourceError?
        ) {
            Log.e(LOGTAG, "onReceivedError url ${request?.url}  ${error?.description}")
            super.onReceivedError(view, request, error)
        }

        override fun onReceivedSslError(
            view: WebView?,
            handler: SslErrorHandler?,
            error: SslError?
        ) {
            Log.e(LOGTAG, "onReceivedErrorSSL url ${error?.url}  ${error?.toString()}")
            super.onReceivedSslError(view, handler, error)
        }

        override fun onPageFinished(view: WebView, url: String) {

            Log.i(LOGTAG, "onPageFinished")

            view.evaluateJavascript(readFromAsset(context, "Readability.js"), null)

            view.evaluateJavascript(JS_SCRIPT_READABILITY, ValueCallback<String?> { result ->
                run {
                    onScrapeAssets(result, url, onProgress)
                }
            })


////          POSTLIGHT
//
//            view.evaluateJavascript(readFromAsset(context, "mercury.web.js"), null)
//
//            view.evaluateJavascript("""
//
//                // TODO: cant get this to work. try to recompile this so Parser is exported instead of Mercury
//
//                    function parse(url, html) {
//                      return new Promise(resolve => {
//                          return Mercury.parse(url, {
//                            html
//                            }).then(resolve);
//                      });
//                    }
//
//
//    let url = "https://asdaasda.com/coolarticle.html";
//
//    console.log(url)
//
////        let content = await parse(document.URL, document.documentElement.outerHTML)
//
////                     document.URL
////                     document.documentElement.outerHTML
//
//
//                            """.trimIndent(), ValueCallback<String?> { result ->
//                run {
//
//                    if (result == null || result == "null") {
//                        Log.e(LOGTAG, "null postlight result")
//                    } else {
//
//                        Log.d("callback_result", result)
//
//                        val jsonElement: JsonElement = Json.parseToJsonElement(result)
//
//                        val content =
//                            StringEscapeUtils.unescapeJava(jsonElement.jsonObject["content"].toString())
//                                .trim('"')
//
//                        val title = jsonElement.jsonObject["title"].toString().trim('"')
//
//                        Log.i(LOGTAG, content)
//
//                        val slug = toUrlSlug(title)
//
//                        val gson = GsonBuilder().setPrettyPrinting().create()
//                        val prettyJsonString = gson.toJson(jsonElement)
//
//                        createFileText(context, "postlight.json", prettyJsonString, slug)
//
//                        createFileText(context, "postlight.html", content, slug)
//
////                        val html = formatHtml(content, title, "date goes here", "Elvis")
//
//                    }
//                }
//            })

        }
    }

    val view = WebView(context).apply {
        layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )
        webViewClient = webViewClient1

        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
    }

    view.visibility = INVISIBLE

    Log.i(LOGTAG, "created webview for $url")

    if (url != null) {
        view.loadUrl(url)
    }
}


@Composable
fun AddArticleDialog(
    onDismissRequest: () -> Unit,
    onRefreshPosts: () -> Unit,
    onScrapeAssets: (String?, String, (Int, String) -> Unit) -> Unit,
) {

    var startUrl = ""

    if (BuildConfig.DEBUG) {

        val context = LocalContext.current
        val allArticles = JsonDb(context).getEverything()
        val urlsInUse = allArticles.articles.map { it.url }.toSet()
        val chooseFrom = sampleArticleUrls subtract urlsInUse

        if (chooseFrom.isNotEmpty())
            startUrl = chooseFrom.asSequence().shuffled().find { true } ?: error("Error picking sample")
    }

    var urlText by rememberSaveable { mutableStateOf(startUrl) }

    var processArticle by rememberSaveable {
        mutableStateOf(false)
    }

    var ingestPercent by rememberSaveable {
        mutableStateOf(5)
    }

    var ingestMessage by rememberSaveable {
        mutableStateOf("adding article")
    }

    Dialog(onDismissRequest = { onDismissRequest() }) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
//            shape = RoundedCornerShape(16.dp),
        ) {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    modifier = Modifier.paddingFromBaseline(50.dp),
                    text = "Add article",
                    style = MaterialTheme.typography.titleLarge
                )

                OutlinedTextField(
                    modifier = Modifier.padding(20.dp),
                    value = urlText,
                    onValueChange = { urlText = it },
                    label = { Text("URL") }
                )

                if (processArticle) {
                    LinearProgressIndicator(
                        progress = { (ingestPercent.toFloat() - 1f) / 100 },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 25.dp),
                    )

                    Text(
                        modifier = Modifier
                            .align(Alignment.Start)
                            .padding(horizontal = 25.dp, vertical = 5.dp),
//                    modifier = Modifier.paddingFromBaseline(50.dp),
                        text = ingestMessage + " ...",
                        style = MaterialTheme.typography.bodySmall
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center,
                ) {
                    TextButton(
                        enabled = !processArticle,
                        onClick = {
                            processArticle = true
                        },
                        modifier = Modifier.padding(8.dp),
//                        border = BorderStroke(10.dp, brush)
                    ) {
                        Text("Save")
                    }
                    TextButton(
                        onClick = { onDismissRequest() },
                        modifier = Modifier.padding(8.dp),
                    ) {
                        Text("Cancel")
                    }
                }

                if ((urlText != "") && (processArticle)) {
                    ScraperWebView(
                        urlText,
                        onProgress = { percent, message ->
                            ingestPercent = percent
                            ingestMessage = message
                            Log.i(
                                LOGTAG,
                                "ingest: % ${(ingestPercent.toFloat() - 1f) / 100}  $ingestMessage"
                            )
                            if (ingestPercent == 100) {
                                onRefreshPosts()
                                processArticle = false
                                onDismissRequest()
                            }
                        },
                        onScrapeAssets = onScrapeAssets,
                    )
                }
            }
        }
    }
}


@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HomeTopAppBar(
    modifier: Modifier = Modifier,
    topAppBarState: TopAppBarState = rememberTopAppBarState(),
    scrollBehavior: TopAppBarScrollBehavior? =
        TopAppBarDefaults.enterAlwaysScrollBehavior(topAppBarState),
    onRefreshPosts: () -> Unit,
    onChangeMode: (String) -> Unit,
    onScrapeAssets: (String?, String, (Int, String) -> Unit) -> Unit
) {
    val context = LocalContext.current

    val alertBuilder: AlertDialog.Builder = AlertDialog.Builder(context)

    var openAddDialog by remember { mutableStateOf(false) }

    CenterAlignedTopAppBar(
        title = {
            var selectedIndex by remember { mutableStateOf(0) }

            SingleChoiceSegmentedButtonRow {

                SegmentedButton(
                    shape = SegmentedButtonDefaults.itemShape(index = 0, count = 2),
//                    TODO: figure out how to lower Shape Density
                    onClick = {
                        selectedIndex = 0
                        onChangeMode("saves")
                    },
                    selected = 0 == selectedIndex,
                    icon = {
                        Icon(
                            imageVector = Icons.Filled.PermMedia,
                            contentDescription = "saves",
                            modifier = Modifier.size(SegmentedButtonDefaults.IconSize)
                        )
                    }
                ) {
                    Text("Saves")
                }

                SegmentedButton(
                    shape = SegmentedButtonDefaults.itemShape(index = 1, count = 2),
                    onClick = {
                        selectedIndex = 1
                        onChangeMode("archive")

//                        alertBuilder
//                            .setMessage("Archive view not yet implemented")
//                            .setPositiveButton("Ok") { dialog, which -> }.create().show()

                    },
                    selected = 1 == selectedIndex,
                    icon = {
                        Icon(
                            imageVector = Icons.Filled.Inventory,
                            contentDescription = "archive",
                            modifier = Modifier.size(SegmentedButtonDefaults.IconSize)
                        )
                    },
                ) {
                    Text("Archive")
                }
            }

        },
        navigationIcon = {
            IconButton(onClick = { openAddDialog = true }) {
                Icon(
                    imageVector = Icons.Filled.AddCircleOutline,
                    contentDescription = "Add"
                )
            }
        },
        actions = {

//            IconButton(onClick = {
//                alertBuilder
//                    .setMessage("Saves view not implemented")
//                    .setPositiveButton("Ok") { dialog, which -> }.create().show()
//
//            }) {
//                Icon(
//                    imageVector = Icons.Filled.PermMedia,
//                    contentDescription = "Saves"
//                )
//            }
//
//            IconButton(onClick = {
////                Toast.makeText(context,
////                    "Archive view is not yet implemented",
////                    Toast.LENGTH_LONG).show()
//
//                alertBuilder
//                    .setMessage("Archive view not implemented")
//                    .setPositiveButton("Ok") { _, _ -> }.create().show()
//
//            }) {
//                Icon(
//                    imageVector = Icons.Filled.Inventory,
////                    imageVector = Icons.Filled.Archive,
//                    contentDescription = "Archive"
//                )
//            }


            IconButton(onClick = {

                val intent = Intent(
                    context,
                    SettingsActivity::class.java
//                    PrefsActivity::class.java
                )
                startActivity(context, intent, null)
            }) {
                Icon(
                    imageVector = Icons.Filled.Settings,
                    contentDescription = stringResource(R.string.settings)
                )
            }
        },
        scrollBehavior = scrollBehavior,
        modifier = modifier
    )

    if (openAddDialog) {

        if (prefsGetString(context, PREFS_KEY_DATADIR) == null || prefsGetString(
                context,
                PREFS_KEY_DATADIR
            ) == ""
        ) {
            openAddDialog = true
            SetupRequiredAlert(context)
//            TODO: get this to work on second click
        } else {
            AddArticleDialog(
                onDismissRequest = { openAddDialog = false },
                onRefreshPosts = onRefreshPosts,
                onScrapeAssets = onScrapeAssets,
            )
        }
    }
}

@Preview("Add article dialog")
@Composable
fun PreviewArticleDialog() {
    AddArticleDialog({}, {}) { resut, url, onProgress ->

    }
}


// TODO: re-enable once the functions settle

//@Preview("Home list navrail screen", device = Devices.NEXUS_7_2013)
//@Preview(
//    "Home list navrail screen (dark)",
//    uiMode = UI_MODE_NIGHT_YES,
//    device = Devices.NEXUS_7_2013
//)
//@Preview("Home list navrail screen (big font)", fontScale = 1.5f, device = Devices.NEXUS_7_2013)
//@Composable
//fun PreviewHomeListNavRailScreen() {
//    val articlesFeed = runBlocking {
//        (BlockingFakeArticlesRepository().getArticlesFeed() as Result.Success).data
//    }
//    SavrTheme {
//        HomeFeedScreen(
//            uiState = HomeUiState.HasPosts(
//                articlesFeed = articlesFeed,
//                articlesReadable = emptyList(),  // TODO: figure out how to mock
//                articlesArchived = emptyList(),
//                selectedArticle = article1,
//                isArticleOpen = false,
//                isLoading = false,
//                errorMessages = emptyList(),
//                searchInput = ""
//            ),
//            onSelectPost = {},
//            onRefreshPosts = {},
//            onErrorDismiss = {},
//            homeListLazyListState = rememberLazyListState(),
//            snackbarHostState = SnackbarHostState(),
//            mode = "saves"
//        )
//    }
//}
//
//@Preview("Home list navrail screen", device = Devices.NEXUS_7_2013)
////@Preview(
////    "Home list navrail screen (dark)",
////    uiMode = UI_MODE_NIGHT_YES,
////    device = Devices.NEXUS_7_2013
////)
////@Preview("Home list navrail screen (big font)", fontScale = 1.5f, device = Devices.NEXUS_7_2013)
//@Composable
//fun NoArticlesList() {
//    val articlesFeed = ArticlesFeed(
//        all = mutableListOf()
//    )
////    val articlesFeed = runBlocking {
////        (BlockingFakeArticlesRepository().getArticlesFeed() as Result.Success).data
////    }
//    SavrTheme {
//        HomeFeedScreen(
//            uiState = HomeUiState.HasPosts(
//                articlesFeed = articlesFeed,
//                articlesReadable = emptyList(),
//                articlesArchived = emptyList(),
//                selectedArticle = article1,
//                isArticleOpen = false,
////                favorites = emptySet(),
//                isLoading = false,
//                errorMessages = emptyList(),
//                searchInput = ""
//            ),
//            onSelectPost = {},
//            onRefreshPosts = {},
//            onErrorDismiss = {},
//            homeListLazyListState = rememberLazyListState(),
//            snackbarHostState = SnackbarHostState(),
//            mode = "saves"
//        )
//    }
//}