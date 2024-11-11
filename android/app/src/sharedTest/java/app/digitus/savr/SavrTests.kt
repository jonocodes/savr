

package app.digitus.savr

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SavrTests {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Before
    fun setUp() {
        // Using targetContext as the Context of the instrumentation code
        composeTestRule.launchSavrApp(ApplicationProvider.getApplicationContext())
    }

    @Test
    fun fake_test() {
//        to satisfy test runner
    }

//    @Test
//    fun app_launches() {
//        composeTestRule.onNodeWithText("").assertExists()
//    }

//    @Test
//    fun app_opensArticle() {
//
//        println(composeTestRule.onRoot().printToString())
//        composeTestRule.onAllNodes(hasText("Manuel Vivo", substring = true))[0].performClick()
//
//        println(composeTestRule.onRoot().printToString())
//        try {
//            composeTestRule.onAllNodes(hasText("3 min read", substring = true))[0].assertExists()
//        } catch (e: AssertionError) {
//            println(composeTestRule.onRoot().printToString())
//            throw e
//        }
//    }

}
