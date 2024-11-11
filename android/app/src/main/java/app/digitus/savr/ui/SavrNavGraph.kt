
package app.digitus.savr.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navDeepLink
import app.digitus.savr.SavrApplication.Companion.APP_URI
import app.digitus.savr.data.AppContainer
import app.digitus.savr.ui.home.HomeRoute
import app.digitus.savr.ui.home.HomeViewModel

const val POST_ID = "postId"

@Composable
fun SavrNavGraph(
    appContainer: app.digitus.savr.data.AppContainer,
    modifier: Modifier = Modifier,
    navController: NavHostController = rememberNavController(),
    startDestination: String = SavrDestinations.HOME_ROUTE,
) {
    NavHost(
        navController = navController,
        startDestination = startDestination,
        modifier = modifier
    ) {
        composable(
            route = SavrDestinations.HOME_ROUTE,
            deepLinks = listOf(
                navDeepLink {
                    uriPattern =
                        "$APP_URI/${SavrDestinations.HOME_ROUTE}?$POST_ID={$POST_ID}"
                }
            )
        ) { navBackStackEntry ->
            val homeViewModel: HomeViewModel = viewModel(
                factory = HomeViewModel.provideFactory(
                    articlesRepository = appContainer.articlesRepository,
                    preSelectedArticleSlug = navBackStackEntry.arguments?.getString(POST_ID)
                )
            )
            HomeRoute(
                homeViewModel = homeViewModel
            )
        }
    }
}
