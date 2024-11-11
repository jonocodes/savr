package app.digitus.savr.ui.article

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Cloud
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.tooling.preview.Devices
import androidx.compose.ui.tooling.preview.Preview
import app.digitus.savr.model.Article

@Composable
fun ArticleScreenMenu(
    isExpanded: Boolean,
    article: Article,
//    webReaderViewModel: WebReaderViewModel,
    onDismiss: () -> Unit,
//    actionHandler: (SavedItemAction) -> Unit
    onShare: () -> Unit,
    onDelete: () -> Unit,
    onViewOriginal: () -> Unit,
) {

    var openInfoDialog by remember { mutableStateOf(false) }

    DropdownMenu(expanded = isExpanded, onDismissRequest = onDismiss) {
        DropdownMenuItem(
            text = { Text("Visit original") },
            onClick = onViewOriginal,
            leadingIcon = { Icon(Icons.Outlined.Cloud, contentDescription = null) }
        )
//        DropdownMenuItem(
//            text = { Text("Info") },
//            onClick = { openInfoDialog = true },
//            leadingIcon = { Icon(Icons.Outlined.Info, contentDescription = null) }
//        )
//        DropdownMenuItem(
//            text = { Text("Find in page") },
//            onClick = {  },
//            leadingIcon = { Icon(Icons.Outlined.Search, contentDescription = null) }
//        )
//        DropdownMenuItem(
//            text = { Text("Summarize") },
//            onClick = {  },
//            leadingIcon = { Icon(Icons.Outlined.Summarize, contentDescription = null) },
//        )
//        DropdownMenuItem(
//            text = { Text("Listen") },
//            onClick = { },
//            leadingIcon = { Icon(Icons.Outlined.Headphones, contentDescription = null) },
//        )
        DropdownMenuItem(
            text = { Text("Share URL") },
            onClick = onShare,
            leadingIcon = { Icon(Icons.Outlined.Share, contentDescription = null) },
        )
        DropdownMenuItem(
            text = { Text("Delete") },
            onClick = onDelete,
            leadingIcon = { Icon(Icons.Outlined.Delete, contentDescription = null) },
        )
    }

    if (openInfoDialog) {
        ArticleInfoDialog(
            article = article,
            onDismissRequest = { openInfoDialog = false },
        )
    }

}


@Preview("Article screen menu", device = Devices.NEXUS_7_2013)
@Composable
fun MenuPreview() {
//    SavrTheme {
//        ArticleScreenMenu(true, {})
//    }

    DropdownMenu(expanded = true, onDismissRequest = {}) {
        DropdownMenuItem(
            text = { Text("Edit") },
            onClick = { /* Handle edit! */ },
            leadingIcon = { Icon(Icons.Outlined.Edit, contentDescription = null) }
        )
        DropdownMenuItem(
            text = { Text("Settings") },
            onClick = { /* Handle settings! */ },
            leadingIcon = { Icon(Icons.Outlined.Settings, contentDescription = null) }
        )
    }

}
