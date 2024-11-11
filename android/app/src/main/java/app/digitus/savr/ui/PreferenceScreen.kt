package app.digitus.savr.ui

import android.content.res.Configuration.UI_MODE_NIGHT_YES
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.TopAppBarScrollBehavior
import androidx.compose.material3.rememberTopAppBarState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import app.digitus.savr.R
import app.digitus.savr.SavrApplication.Companion.appDataDir
import app.digitus.savr.ui.theme.SavrTheme
import app.digitus.savr.utils.PREFS_KEY_THEME
import app.digitus.savr.utils.getChosenTheme
import app.digitus.savr.utils.prefsStoreString
import me.zhanghai.compose.preference.ListPreference
import me.zhanghai.compose.preference.ProvidePreferenceLocals
import me.zhanghai.compose.preference.ProvidePreferenceTheme
import me.zhanghai.compose.preference.preference

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PreferencesScreen(
    onBack: () -> Unit,
    onClickSetDir: () -> Unit,
    onThemeChange: (String) -> Unit,
//    navigationIconContent: @Composable () -> Unit = { },
) {
    val topAppBarState = rememberTopAppBarState()
    val scrollBehavior = TopAppBarDefaults.enterAlwaysScrollBehavior(topAppBarState)

    Scaffold(
        topBar = {
            PreferencesTopAppBar(
//                article = article,
                onBack = onBack,
//                navigationIconContent = navigationIconContent,
                scrollBehavior = scrollBehavior,
                modifier = Modifier.fillMaxWidth(),
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .padding(innerPadding)
//            .verticalScroll(rememberScrollState())
        ) {
            PreferenceContent(onClickSetDir, onThemeChange)
        }

    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PreferencesTopAppBar(
    onBack: () -> Unit,
    scrollBehavior: TopAppBarScrollBehavior?,
    modifier: Modifier = Modifier
) {

    TopAppBar(
        title = { Text(text = "Settings") },
        actions = { },
        navigationIcon = {
            IconButton(onClick = onBack) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = stringResource(R.string.cd_navigate_up),
                    tint = MaterialTheme.colorScheme.primary
                )
            }
        },
        scrollBehavior = scrollBehavior,
        modifier = modifier
    )
}

@Composable
fun PreferenceContent(
    onClickSetDir: () -> Unit,
    onThemeChange: (String) -> Unit,
) {

    val context = LocalContext.current

    var dirState by remember { mutableStateOf(appDataDir?.name ?: "(not set)") }
    var themeState by remember { mutableStateOf(getChosenTheme(context)) }

    ProvidePreferenceTheme {
        ListPreference(
            value = themeState,
            onValueChange = {
                themeState = it
                prefsStoreString(context, PREFS_KEY_THEME, themeState)
                onThemeChange(themeState)
            },
            values = listOf("Follow system", "Light", "Dark"),
            title = { Text(text = "Theme") },
            summary = { Text(text = themeState) },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp)
        )
    }

    ProvidePreferenceLocals {
        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .padding(
                    horizontal = 20.dp,
                    vertical = 5.dp
                )
        ) {
            preference(
                key = "data_directory",
                title = { Text(text = "Data directory") },
                summary = { Text(text = dirState) },
            ) {
                onClickSetDir()
                dirState = appDataDir?.name ?: "(not set)"
//                TODO: refresh article list here

            }

//            listPreference(
//                key = PREFS_KEY_THEME,
//                defaultValue = "Follow system",
//                values = listOf("Follow system", "Light", "Dark"),
//                title = { Text(text = "Theme") },
//                summary = { Text(text = it) },
//            )
//
//            footerPreference(
//                key = "footer_preference",
//                summary = { Text(text = "Savr was created by Jono ...") },
//            )

        }


    }


}




@Preview("Preview content", uiMode = UI_MODE_NIGHT_YES)
@Composable
fun PreviewPrefs() {
    SavrTheme() {
        PreferenceContent({}, {})
    }
}


@Preview("Preview screen", uiMode = UI_MODE_NIGHT_YES)
@Composable
fun PreviewScreen() {
    SavrTheme() {
        PreferencesScreen({}, {}, {})
    }
}