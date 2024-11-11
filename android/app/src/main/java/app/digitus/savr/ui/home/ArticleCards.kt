package app.digitus.savr.ui.home

import android.content.res.Configuration.UI_MODE_NIGHT_YES
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.painter.BitmapPainter
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import app.digitus.savr.R
import app.digitus.savr.data.articles.impl.article1
import app.digitus.savr.model.Article
import app.digitus.savr.ui.theme.SavrTheme
import app.digitus.savr.utils.archiveArticle
import app.digitus.savr.utils.deleteArticle
import app.digitus.savr.utils.getThumbnail
import app.digitus.savr.utils.shareArticle
import app.digitus.savr.utils.unarchiveArticle

@Composable
fun AuthorAndReadTime(
    article: Article,
    modifier: Modifier = Modifier
) {
    Row(modifier) {
        Text(
            text = stringResource(id = R.string.article_min_read).format(
                article.byline(),
                article.readTimeMinutes
            ),
            style = MaterialTheme.typography.bodyMedium
        )
    }
}

@Composable
fun ArticleImage(article: Article, modifier: Modifier = Modifier) {

    val context = LocalContext.current

    val bitmap = getThumbnail(context, article)

    var painter: Painter

    if (bitmap != null) {
        val imageBitmap: ImageBitmap = remember(article.slug) {
            bitmap.asImageBitmap()
        }
        painter = BitmapPainter(image = imageBitmap)
    } else {

        val notFoundStream = context.assets.open("shared/static/article_bw.webp")
        val bmp = BitmapFactory.decodeStream(notFoundStream)

        painter = BitmapPainter(image = bmp.asImageBitmap())
//        painter = painterResource(R.drawable.generic_article_bw) // TODO: remove resource
    }

    Image(
        painter = painter,
        contentDescription = null, // decorative
        modifier = modifier
            .size(60.dp, 60.dp)
            .clip(MaterialTheme.shapes.small)
    )
}

@Composable
fun ArticleTitle(article: Article) {
    Text(
        text = article.title,
        style = MaterialTheme.typography.titleMedium,
        maxLines = 3,
        overflow = TextOverflow.Ellipsis,
    )
}

@Composable
fun ArticleCardSimple(
    article: Article,
    navigateToArticle: (String) -> Unit,
    onRefreshPosts: () -> Unit,
    mode: String,
) {

    val context = LocalContext.current

    var isMenuExpanded by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier
            .clickable(onClick = { navigateToArticle(article.slug) })
            .semantics {
                // By defining a custom action, we tell accessibility services that this whole
                // composable has an action attached to it. The accessibility service can choose
                // how to best communicate this action to the user.
//                customActions = listOf(
//                    CustomAccessibilityAction(
//                        label = bookmarkAction,
//                        action = { onToggleFavorite(); true }
//                    )
//                )
            }
    ) {
        ArticleImage(article, Modifier.padding(16.dp))
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(vertical = 10.dp)
        ) {
            ArticleTitle(article)
            AuthorAndReadTime(article)
        }
        IconButton(onClick = {
            isMenuExpanded = true
        }) {
            Icon(
                imageVector = Icons.Filled.MoreVert,
                contentDescription = stringResource(R.string.cd_more_actions)
            )
            if (isMenuExpanded) {
                ArticleCardMenu(
                    isExpanded = true,
                    mode = mode,
                    onDismiss = { isMenuExpanded = false },
                    onShare = {
                        shareArticle(article, context)
                    },
                    onDelete = {
                        deleteArticle(article, context)
                        onRefreshPosts()
                    },
                    onArchive = {
                        if (mode == "saves") {
                            archiveArticle(article, context)
                            onRefreshPosts()
                        } else if (mode == "archive") {
                            unarchiveArticle(article, context)
                            onRefreshPosts()
                        }
                    }
                )
            }
        }
    }
}

@Preview("Simple Article card")
@Preview("Simple Article card (dark)", uiMode = UI_MODE_NIGHT_YES)
@Composable
fun SimpleArticlePreview() {
    SavrTheme() {
        Surface {
            ArticleCardSimple(article1, {}, {}, "saves")
        }
    }
}
