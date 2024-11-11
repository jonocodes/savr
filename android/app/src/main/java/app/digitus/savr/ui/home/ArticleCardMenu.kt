package app.digitus.savr.ui.home

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Archive
import androidx.compose.material.icons.outlined.Cloud
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Headphones
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.Summarize
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Devices
import androidx.compose.ui.tooling.preview.Preview
import app.digitus.savr.data.articles.impl.article1
import app.digitus.savr.ui.theme.SavrTheme

@Composable
fun ArticleCardMenu(
    isExpanded: Boolean,
    mode: String,
    onDismiss: () -> Unit,
//    actionHandler: (SavedItemAction) -> Unit
    onShare: () -> Unit,
    onArchive: () -> Unit,
    onDelete: () -> Unit,
) {

    DropdownMenu(expanded = isExpanded, onDismissRequest = onDismiss) {

        if (mode == "saves") {
            DropdownMenuItem(
                text = { Text("Archive") },
                onClick = onArchive,
                leadingIcon = { Icon(Icons.Outlined.Archive, contentDescription = null) },
            )
        } else if (mode == "archive") {
            DropdownMenuItem(
                text = { Text("Unarchive") },
                onClick = onArchive,
                leadingIcon = { Icon(Icons.Outlined.Archive, contentDescription = null) },
            )
        }
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

}
