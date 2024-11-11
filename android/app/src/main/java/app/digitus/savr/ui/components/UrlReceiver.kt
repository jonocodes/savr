package app.digitus.savr.ui.components

import android.util.Log
import android.util.Patterns
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.paddingFromBaseline
import androidx.compose.material3.Card
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import app.digitus.savr.ui.home.ScraperWebView
import app.digitus.savr.utils.LOGTAG


@Composable
fun UrlReceiverDialog(
    urlText: String?,
    onDismissRequest: () -> Unit,
    onScrapeAssets: (String?, String, (Int, String) -> Unit) -> Unit,
) {

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
                    text = "Adding article to Savr",
                    style = MaterialTheme.typography.titleLarge
                )

                if (urlText == null) {
                    Text(
                        modifier = Modifier.paddingFromBaseline(50.dp),
                        text = "Cant process empty URL",
                    )

                } else if (!Patterns.WEB_URL.matcher(urlText).matches()) {
                    Text(
                        modifier = Modifier.paddingFromBaseline(50.dp),
                        text = "URL not valid",
                    )
                } else {
//                    Text(
//                        modifier = Modifier.paddingFromBaseline(50.dp),
//                        text = urlText,
//                    )

                    LinearProgressIndicator(       // TODO: replace with ProgressDialog?
                        progress = { (ingestPercent.toFloat()-1f) / 100 },
                        modifier = Modifier.padding(top = 25.dp),
                    )

                    Text(
                        modifier = Modifier.align(Alignment.Start).padding(horizontal=25.dp, vertical = 5.dp),
                        text = ingestMessage + " ...",
                        style = MaterialTheme.typography.bodySmall
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center,
                ) {
                    TextButton(
                        onClick = { onDismissRequest() },
                        modifier = Modifier.padding(8.dp),
                    ) {
                        Text("Cancel")
                    }
                }

                if (urlText != "") {
                    Log.d(LOGTAG, "starting scraper with: $urlText")
                    ScraperWebView(urlText,
                        onProgress = {percent, message ->
                            ingestPercent = percent
                            ingestMessage = message
                            Log.i(LOGTAG, "ingest: % ${(ingestPercent.toFloat()-1f) / 100}  $ingestMessage")
                            if (ingestPercent == 100) {
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
