
package app.digitus.savr.ui.article

import android.content.Intent
import android.net.Uri
import android.util.Log
import android.view.View.VISIBLE
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.TextDecrease
import androidx.compose.material.icons.filled.TextIncrease
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.TopAppBarScrollBehavior
import androidx.compose.material3.rememberTopAppBarState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Devices
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.core.content.ContextCompat.startActivity
import app.digitus.savr.R
import app.digitus.savr.SavrApplication.Companion.appSavesDir
import app.digitus.savr.data.articles.impl.article1
import app.digitus.savr.model.Article
import app.digitus.savr.ui.theme.SavrTheme
import app.digitus.savr.utils.DEFAULT_ARTICLE_FONTSIZE_PX
import app.digitus.savr.utils.LOGTAG
import app.digitus.savr.utils.PREFS_KEY_FONT_SIZE_MODIFIER
import app.digitus.savr.utils.archiveArticle
import app.digitus.savr.utils.articleDirectorySize
import app.digitus.savr.utils.countArticleFiles
import app.digitus.savr.utils.countArticleWords
import app.digitus.savr.utils.deleteArticle
import app.digitus.savr.utils.getChosenTheme
import app.digitus.savr.utils.prefsGetInt
import app.digitus.savr.utils.prefsStoreInt
import app.digitus.savr.utils.readFromAsset
import app.digitus.savr.utils.readTextFromUri
import app.digitus.savr.utils.renderArticleHtml
import app.digitus.savr.utils.shareArticle
import app.digitus.savr.utils.unarchiveArticle
import org.jsoup.Jsoup


var pageWebView : WebView? = null   // TODO: dont use global (memory leak?)


@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ArticleScreen(
    article: Article,
    onBack: () -> Unit,
) {
    ArticleScreenContent(
        article = article,
        onBack = onBack,
        navigationIconContent = {
            IconButton(onClick = onBack) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = stringResource(R.string.cd_navigate_up),
                    tint = MaterialTheme.colorScheme.primary
                )
            }
        },
    )
}


fun extractElementContent(htmlContent: String, elementId: String): String? {
    // Parse the HTML file

    val document = Jsoup.parse(htmlContent, "UTF-8")

    // Select the element by ID
    val element = document.getElementById(elementId)

    // Return the content as a string or null if the element is not found
    return element?.html()
}


//@ExperimentalMaterial3Api
@Composable
fun DisplayWebView(article: Article) {

    val context = LocalContext.current

    val myWebViewClient= object : WebViewClient() {

        override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
            val uri = request?.url
            if (uri?.scheme == "savr") {

//                TODO: make this less hacky

                appSavesDir?.findFile(uri.host + uri.path)
                val saveDir = appSavesDir?.findFile(uri.host.toString())
                val images = saveDir?.findFile("images")
                val image = images?.findFile(uri.pathSegments.last()) //?: error("Can not find image for ${uri.path}")

                if (image == null) {
                    Log.e(LOGTAG,"Can not find image for ${uri.path}")
                    return null
                }

                Log.d(LOGTAG, "Intercept and load image: ${image.name}")

                val inputStream = context.contentResolver.openInputStream(image.uri)
                return WebResourceResponse("image/png", null, inputStream)
            }
            if (uri?.scheme == "https" || uri?.scheme == "http") {
//                TODO: clean these up. ie - <source sourceset="">
                Log.e(LOGTAG, "! still referencing external: ${uri.toString()}")
            }
            return super.shouldInterceptRequest(view, request)
        }


        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
//            This opens links in on HTML page in the external browser
            val intent = Intent(Intent.ACTION_VIEW, request.url)
            view.context.startActivity(intent)
            return true
        }

        override fun onPageFinished(view: WebView, url: String) {
            Log.i(LOGTAG, "onPageFinished $url")

            view.evaluateJavascript(readFromAsset(context, "displayHelpers.js")) { result ->
                run {
                    Log.d(LOGTAG, "done loading displayHelpers.js")
                    Log.d(LOGTAG, result)
                }
            }
        }
    }

    val webView = WebView(context).apply {
        layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )
        
        webViewClient = myWebViewClient

        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true

//        settings.allowFileAccess = true
//        settings.allowFileAccessFromFileURLs = true
//        settings.allowUniversalAccessFromFileURLs = true
    }

    webView.visibility = VISIBLE

    AndroidView(factory = {webView})

//                view.webChromeClient = object : WebChromeClient() {
//
//                    override fun onConsoleMessage(message: ConsoleMessage): Boolean {
//                        Log.d("MyApplication JS", "${message.message()} -- From line " +
//                                "${message.lineNumber()} of ${message.sourceId()}")
//                        return true
//                    }
//                }


    val articleDir = appSavesDir?.findFile(article.slug)

    var html = """<h2>Content File not found</h2>"""

//    val contentFile = articleDir?.findFile("content.html")
//
////    TODO: extract content from index.html instead of content.html
//    //  and explain why we are doing that



    val contentFile = articleDir?.findFile("index.html")

    if (contentFile != null) {
        html = readTextFromUri(context, contentFile.uri)
    }

    val document = Jsoup.parse(html, "UTF-8")

    // Select the element by ID
    val element = document.getElementById("readability-page-1")

    // Return the content as a string or null if the element is not found
    html = element?.html() ?: """<h2>Content ID not found</h2>"""

    val chosenTheme = getChosenTheme(context)

    var theme = "light"
    if (chosenTheme == "Dark")
        theme = "dark"
    if (chosenTheme == "Follow system" && isSystemInDarkTheme())
        theme = "dark"

    val fontMod = prefsGetInt(context, PREFS_KEY_FONT_SIZE_MODIFIER)
    val fontSize = DEFAULT_ARTICLE_FONTSIZE_PX + fontMod

//    html = formatHtmlAndroid(article, html, fontSize, theme)
    html = renderArticleHtml(context, article, html, fontSize, theme)

    Log.d(LOGTAG, html)

//    webView.loadDataWithBaseURL("file:///android_asset/", html, "text/html", "UTF-8", null)
//    webView.loadDataWithBaseURL("file:///com.android.externalstorage.documents/tree/primary%3Asvr2/document/primary%3Asvr2%2Fsaves%2Fjetnews-for-every-screen---android-developers---medium%2Fimages/", html, "text/html", "UTF-8", null)
//    webView.loadDataWithBaseURL("content://com.android.externalstorage.documents/tree/primary%3Asvr2/document/primary%3Asvr2%2Fsaves%2Fjetnews-for-every-screen---android-developers---medium%2Fimages/", html, "text/html", "UTF-8", null)
//    webView.loadDataWithBaseURL("file:///storage/emulated/0/svr2/saves/jetnews-for-every-screen---android-developers---medium/", html, "text/html", "UTF-8", null)

    webView.loadDataWithBaseURL("savr://" + articleDir?.name + "/", html, "text/html", "UTF-8", null)

    pageWebView = webView
}

@ExperimentalMaterial3Api
@Composable
private fun ArticleScreenContent(
    article: Article,
    onBack: () -> Unit,
    navigationIconContent: @Composable () -> Unit = { },
) {
    val topAppBarState = rememberTopAppBarState()
    val scrollBehavior = TopAppBarDefaults.enterAlwaysScrollBehavior(topAppBarState)

    Scaffold(
        topBar = {
            ArticleTopAppBar(
                article = article,
                onBack = onBack,
                navigationIconContent = navigationIconContent,
                scrollBehavior = scrollBehavior
            )
        },
    ) {
        innerPadding ->
        Column(
            modifier = Modifier
            .padding(innerPadding)
//            .verticalScroll(rememberScrollState())
        ) {
            DisplayWebView(article)
        }

    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ArticleTopAppBar(
    article: Article,
    onBack: () -> Unit,
    navigationIconContent: @Composable () -> Unit,
    scrollBehavior: TopAppBarScrollBehavior?,
    modifier: Modifier = Modifier
) {

    val context = LocalContext.current

    var isMenuExpanded by remember { mutableStateOf(false) }

    TopAppBar(
        title = {

        },
        actions = {

            IconButton(onClick = {
                if (article.state == "archived") {
                    unarchiveArticle(article, context)

                    Toast.makeText(
                        context,
                        "Article unarchived",
                        Toast.LENGTH_LONG
                    ).show()
                } else {
                    archiveArticle(article, context)

                    Toast.makeText(
                        context,
                        "Article archived",
                        Toast.LENGTH_LONG
                    ).show()
                }
                onBack()

            }) {
                Icon(
                    imageVector = Icons.Filled.Archive,
                    contentDescription = "Archive"
                )
            }
            IconButton(onClick = {
                val fontMod = prefsGetInt(context, PREFS_KEY_FONT_SIZE_MODIFIER)
                prefsStoreInt(context, PREFS_KEY_FONT_SIZE_MODIFIER, fontMod + 3)
                fontSizeModify( 3)
            }) {
                Icon(
                    imageVector = Icons.Filled.TextIncrease,
                    contentDescription = "Increase font size"
                )
            }
            IconButton(onClick = {
                val fontMod = prefsGetInt(context, PREFS_KEY_FONT_SIZE_MODIFIER)
                prefsStoreInt(context, PREFS_KEY_FONT_SIZE_MODIFIER, fontMod - 3)
                fontSizeModify(- 3)
            }) {
                Icon(
                    imageVector = Icons.Filled.TextDecrease,
                    contentDescription = "Decrease font size"
                )
            }

            IconButton(onClick = { isMenuExpanded = true }) {
                Icon(Icons.Default.MoreVert, contentDescription = "Localized description")
            }
            if (isMenuExpanded) {
                ArticleScreenMenu(
                    isExpanded = true,
                    article = article,
                    onDismiss = { isMenuExpanded = false },
                    onShare = {
                        shareArticle(article, context)
                    },
                    onDelete = {
                        deleteArticle(article, context)
                        onBack()
                        Toast.makeText(
                            context,
                            "Article deleted",
                            Toast.LENGTH_LONG
                        ).show()
                    },
                    onViewOriginal = {
                        val browserIntent = Intent(Intent.ACTION_VIEW, Uri.parse(article.url))
                        startActivity(context, browserIntent, null)
                    },
                )
            }

        },
        navigationIcon = navigationIconContent,
        scrollBehavior = scrollBehavior,
        modifier = modifier
    )
}

@Composable
fun ArticleInfoDialog(
    article: Article,
    onDismissRequest: () -> Unit,
) {

    val context = LocalContext.current

    val fileCount = countArticleFiles(context, article)
    val size = articleDirectorySize(context, article)
    val wordCount = countArticleWords(context, article)

    val text = """
        Title: "${article.title}"
        Author: ${article.author}
        Saved date: ${article.ingestDate}
        Words: $wordCount
        Files: $fileCount
        Size: $size
    """.trimIndent()

    Dialog(onDismissRequest = { onDismissRequest() }) {
        // Draw a rectangle shape with rounded corners inside the dialog
        Card(
            modifier = Modifier
//                .fillMaxWidth()
//                .height(375.dp)
                .padding(16.dp),
            shape = RoundedCornerShape(16.dp),
        ) {
            Column(
//                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = text,
                    modifier = Modifier.padding(26.dp),
                )
                Row(
//                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center,
                ) {
                    TextButton(
                        onClick = { onDismissRequest() },
                        modifier = Modifier.padding(8.dp),
                    ) {
                        Text("Close")
                    }
                }
            }
        }
    }
}

fun fontSizeModify(amount: Int) {
    pageWebView?.evaluateJavascript("fontSizeModify($amount)") { result ->
        run {
            Log.d(LOGTAG, "done setting font")
            Log.d(LOGTAG, result)
        }
    }
}


@Preview("Article screen navrail", device = Devices.NEXUS_7_2013)
@Composable
fun MyPreview() {
    SavrTheme() {
        ArticleInfoDialog(article1, {})
    }
}


@Preview("Article info", device = Devices.NEXUS_7_2013)
@Composable
fun MyArticleInfo() {
    SavrTheme() {
        ArticleScreen(article1, {})
    }
}


//
//@Preview("Article screen navrail", device = Devices.PIXEL_C)
//@Preview(
//    "Article screen navrail (dark)",
//    uiMode = UI_MODE_NIGHT_YES,
//    device = Devices.PIXEL_C
//)
//@Preview("Article screen navrail (big font)", fontScale = 1.5f, device = Devices.PIXEL_C)
//@Composable
//fun PreviewArticleNavRail() {
//    JetnewsTheme {
//        val article = runBlocking {
//            (BlockingFakeArticlesRepository().getArticle("first-slug") as Result.Success).data
//        }
//        ArticleScreen(article, true, {}, false, {})
//    }
//}
