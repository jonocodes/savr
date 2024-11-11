
package app.digitus.savr.ui

import android.content.Intent
import android.content.SharedPreferences.OnSharedPreferenceChangeListener
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.lifecycleScope
import androidx.preference.PreferenceManager
import app.digitus.savr.ui.components.UrlReceiverDialog
import app.digitus.savr.utils.LOGTAG
import app.digitus.savr.utils.PREFS_KEY_THEME
import app.digitus.savr.utils.getChosenTheme
import app.digitus.savr.utils.prefsStoreString
import app.digitus.savr.utils.scrapeReadabilityAssets
import app.digitus.savr.utils.setDirectories
import kotlinx.coroutines.launch


class MainActivity : ComponentActivity() {

//    @OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        setDirectories(applicationContext)

        Log.i(LOGTAG, "INTENT ${intent}")

        val preferences = PreferenceManager.getDefaultSharedPreferences(this)
        preferences.registerOnSharedPreferenceChangeListener(listener)

        when {

            intent?.action == Intent.ACTION_SEND -> {
                if ("text/plain" == intent.type) {

                    val receivedText = intent.getStringExtra(Intent.EXTRA_TEXT)

                    Log.d(LOGTAG, "receivedText: ${receivedText}")

                    setContent {
                        UrlReceiverDialog(
                            urlText = receivedText,
                            onDismissRequest = { finish() },
                            onScrapeAssets = { result, url, onProgress -> lifecycleScope.launch {
                                scrapeReadabilityAssets(
                                    context = app.digitus.savr.SavrApplication.appContext ?: error("App context is null"),
                                    url = url,
                                    onProgress = onProgress,
                                    result = result,
                                )
                            }},
                        )
                    }
                }
            }

            else -> {
                val appContainer = (application as app.digitus.savr.SavrApplication).container
                setContent {
//            val widthSizeClass = calculateWindowSizeClass(this).widthSizeClass
                    SavrApp(appContainer)
                }
            }
        }
    }

    private val listener =
        OnSharedPreferenceChangeListener { sharedPreferences, key ->

            if (key == PREFS_KEY_THEME) {

//                TODO: change this kludge which copies preferences
                val chosenTheme =
                    sharedPreferences.getString(PREFS_KEY_THEME, "Follow system") ?: "Follow system"
                prefsStoreString(applicationContext, PREFS_KEY_THEME, chosenTheme)

                Log.i(LOGTAG, "prefs change: $key  ${getChosenTheme(applicationContext)}")
            }
        }

}
