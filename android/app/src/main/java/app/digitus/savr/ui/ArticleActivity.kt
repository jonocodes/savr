package app.digitus.savr.ui

import android.annotation.SuppressLint
import android.os.Bundle
import android.util.Log
import android.view.Menu
import android.view.MenuInflater
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.view.menu.MenuBuilder
import app.digitus.savr.R
import app.digitus.savr.databinding.ActivityArticleBinding
import app.digitus.savr.utils.LOGTAG


class ArticleActivity : AppCompatActivity() {

    private lateinit var binding: ActivityArticleBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val args: Bundle? = intent.extras
        val slug = args?.getString("slug")

        Log.d(LOGTAG,"article activity started with slug: $slug")

        binding = ActivityArticleBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.toolbar)

        supportActionBar?.setDisplayHomeAsUpEnabled(true)

//        val appContainer = (application as SavrApplication).container


//        setContent {
//
//            Column(modifier = Modifier
//                .fillMaxSize()
//                .padding(top = 100.dp)
//                .verticalScroll(rememberScrollState())) {
//                DisplayWebView(article1)
//            }
//
//        }

    }

    @SuppressLint("RestrictedApi")
    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        val inflater: MenuInflater = menuInflater
        inflater.inflate(R.menu.article, menu)

        if (menu is MenuBuilder) {
            menu.setOptionalIconsVisible(true)
        }

        return true
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }

}

//
//@Composable
//fun DisplayWebView(article: Article) {
//    val view = WebView(LocalContext.current).apply {
//        layoutParams = ViewGroup.LayoutParams(
//            ViewGroup.LayoutParams.MATCH_PARENT,
//            ViewGroup.LayoutParams.MATCH_PARENT
//        )
//
//        // NOTE: these break the preview renderer
////        settings.allowFileAccess = true
////        settings.allowContentAccess = true
//    }
//
//    view.visibility = VISIBLE
//
//    AndroidView(factory = {view})
//
////                view.webChromeClient = object : WebChromeClient() {
////
////                    override fun onConsoleMessage(message: ConsoleMessage): Boolean {
////                        Log.d("MyApplication JS", "${message.message()} -- From line " +
////                                "${message.lineNumber()} of ${message.sourceId()}")
////                        return true
////                    }
////                }
//
//
//    val articleDir = appSavesDir?.findFile(article.slug)
//
//    val readabilityFile = articleDir?.findFile("index.html")
//
//    var html = """
//                        <h2>Content not found</h2><br />
//                        <img src="test.png">
//                        """
//
//    if (readabilityFile != null) {
//        html = readTextFromUri(LocalContext.current, readabilityFile.uri)
//    }
//
//    Log.d(LOGTAG, html)
//
//    view.loadDataWithBaseURL("file:///android_asset/", html, "text/html", "UTF-8", null)
//}
