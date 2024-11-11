
package app.digitus.savr.ui

import androidx.compose.foundation.layout.Row
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.navigation.compose.rememberNavController
import app.digitus.savr.data.AppContainer
import app.digitus.savr.ui.theme.SavrTheme
import app.digitus.savr.utils.getChosenTheme

//@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SavrApp(
    appContainer: app.digitus.savr.data.AppContainer,
) {

    val context = LocalContext.current
    val lifecycleOwner: LifecycleOwner = LocalLifecycleOwner.current
    var themeState by remember { mutableStateOf(getChosenTheme(context)) }

    SavrTheme(themeState) {
        val navController = rememberNavController()

        Row {
            SavrNavGraph(
                appContainer = appContainer,
                navController = navController,
            )
        }
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                themeState = getChosenTheme(context)
            }
        }

        lifecycleOwner.lifecycle.addObserver(observer)

        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }
}
