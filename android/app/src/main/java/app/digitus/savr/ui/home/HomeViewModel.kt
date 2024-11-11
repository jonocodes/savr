package app.digitus.savr.ui.home

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import app.digitus.savr.R
import app.digitus.savr.data.Result
import app.digitus.savr.data.articles.ArticlesRepository
import app.digitus.savr.data.articles.impl.article_dummy
import app.digitus.savr.model.Article
import app.digitus.savr.model.ArticlesFeed
import app.digitus.savr.utils.DbCreationException
import app.digitus.savr.utils.ErrorMessage
import app.digitus.savr.utils.LOGTAG
import app.digitus.savr.utils.scrapeReadabilityAssets
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID

/**
 * UI state for the Home route.
 *
 * This is derived from [HomeViewModelState], but split into two possible subclasses to more
 * precisely represent the state available to render the UI.
 */
sealed interface HomeUiState {

    val isLoading: Boolean
    val errorMessages: List<ErrorMessage>
    val searchInput: String
    val mode: String
    val configured: Boolean

    /**
     * There are no posts to render.
     *
     * This could either be because they are still loading or they failed to load, and we are
     * waiting to reload them.
     */
    data class NoPosts(
        override val isLoading: Boolean,
        override val errorMessages: List<ErrorMessage>,
        override val searchInput: String,
        override val mode: String,
        override val configured: Boolean,
    ) : HomeUiState

    /**
     * There are posts to render, as contained in [postsFeed].
     *
     * There is guaranteed to be a [selectedPost], which is one of the posts from [postsFeed].
     */
    data class HasPosts(
        val articlesFeed: ArticlesFeed,
        val articlesReadable: List<Article>,
        val articlesArchived: List<Article>,
        val selectedArticle: Article,
        val isArticleOpen: Boolean,
        override val isLoading: Boolean,
        override val errorMessages: List<ErrorMessage>,
        override val searchInput: String,
        override val mode: String,
        override val configured: Boolean,
    ) : HomeUiState
}

/**
 * An internal representation of the Home route state, in a raw form
 */
private data class HomeViewModelState(
    val articlesFeed: ArticlesFeed? = null,
    val articlesReadable: List<Article> = emptyList(),
    val articlesArchived: List<Article> = emptyList(),
    val selectedArticleSlug: String? = null,
    val isArticleOpen: Boolean = false,
    val isLoading: Boolean = false,
    val errorMessages: List<ErrorMessage> = emptyList(),
    val searchInput: String = "",
    val mode: String = "saves",
    val configured: Boolean = false,
) {

    /**
     * Converts this [HomeViewModelState] into a more strongly typed [HomeUiState] for driving
     * the ui.
     */
    fun toUiState(): HomeUiState =
        if (articlesFeed == null) {
            HomeUiState.NoPosts(
                isLoading = isLoading,
                errorMessages = errorMessages,
                searchInput = searchInput,
                mode = mode,
                configured = configured,
            )
        } else {
            HomeUiState.HasPosts(
                articlesFeed = articlesFeed,
                articlesReadable = articlesReadable,
                articlesArchived = articlesArchived,
                selectedArticle = articlesFeed.all.find {
                    it.slug == selectedArticleSlug
                } ?: article_dummy,  // TODO: fix hack
                isArticleOpen = isArticleOpen,
                isLoading = isLoading,
                errorMessages = errorMessages,
                searchInput = searchInput,
                mode = mode,
                configured = configured,
            )
        }
}

/**
 * ViewModel that handles the business logic of the Home screen
 */
class HomeViewModel(
    private val articlesRepository: ArticlesRepository,
    preSelectedArticleSlug: String?,
) : ViewModel() {

    private val viewModelState = MutableStateFlow(
        HomeViewModelState(
            isLoading = true,
            selectedArticleSlug = preSelectedArticleSlug,
            isArticleOpen = preSelectedArticleSlug != null,
            mode = "saves",
        )
    )

    // UI state exposed to the UI
    val uiState = viewModelState
        .map(HomeViewModelState::toUiState)
        .stateIn(
            viewModelScope,
            SharingStarted.Eagerly,
            viewModelState.value.toUiState()
        )

    init {
        refreshArticles()
    }

    fun refreshArticles() {
        // Ui state is refreshing
        viewModelState.update {
            it.copy(isLoading = false)
        }

        viewModelScope.launch {

            val resultArticles = articlesRepository.getArticlesFeed()

            Log.i(LOGTAG, "refreshing articles")

            try {

                val db = app.digitus.savr.data.JsonDb(
                    app.digitus.savr.SavrApplication.appContext ?: error("App context is empty")
                )

                viewModelState.update {
                    when (resultArticles) {
                        is Result.Success -> it.copy(
                            articlesFeed = resultArticles.data,
                            articlesReadable = db.getReadable(),
                            articlesArchived = db.getArchived(),
                            isLoading = false,
                            configured = true,

                        )
                        is Result.Error -> {
                            val errorMessages = it.errorMessages + ErrorMessage(
                                id = UUID.randomUUID().mostSignificantBits,
                                messageId = R.string.load_error
                            )
                            it.copy(
                                errorMessages = errorMessages,
                                isLoading = false)
                        }
                    }
                }

            } catch (_: DbCreationException) {

                viewModelState.update {
                    it.copy(configured = false, isLoading = false)
                }
            }

        }
    }

    fun viewScrapeReadabilityAssets(
        result: String?,
        url: String,
        onProgress: (Int, String) -> Unit
    ) {

        viewModelScope.launch {
            scrapeReadabilityAssets(
                context = app.digitus.savr.SavrApplication.appContext ?: error("App context is empty"),
                url = url,
                onProgress = onProgress,
                result = result,
            )
        }
    }

    fun changeMode(mode: String) {
        viewModelState.update { it.copy(mode = mode) }
    }

    /**
     * Selects the given article to view more information about it.
     */
    fun selectArticle(postId: String) {

        viewModelState.update {
            it.copy(
                isArticleOpen = true,
                selectedArticleSlug = postId,
            )
        }
    }

    fun errorShown(errorId: Long) {
        viewModelState.update { currentUiState ->
            val errorMessages = currentUiState.errorMessages.filterNot { it.id == errorId }
            currentUiState.copy(errorMessages = errorMessages)
        }
    }

    fun interactedWithFeed() {
        viewModelState.update {
            it.copy(isArticleOpen = false)
        }
    }


    companion object {
        fun provideFactory(
            articlesRepository: ArticlesRepository,
            preSelectedArticleSlug: String? = null,
        ): ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return HomeViewModel(articlesRepository, preSelectedArticleSlug) as T
            }
        }
    }
}
