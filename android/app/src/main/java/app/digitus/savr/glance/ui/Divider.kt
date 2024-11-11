
package app.digitus.savr.glance.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceModifier
import androidx.glance.background
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.unit.ColorProvider
import app.digitus.savr.glance.ui.theme.SavrGlanceColorScheme

/**
 * A thin line that groups content in lists and layouts.
 *
 * @param thickness thickness in dp of this divider line.
 * @param color color of this divider line.
 */
@Composable
fun Divider(
    thickness: Dp = DividerDefaults.Thickness,
    color: ColorProvider = DividerDefaults.color
) {
    Spacer(
        modifier = GlanceModifier
            .fillMaxWidth()
            .height(thickness)
            .background(color)
    )
}

/** Default values for [Divider] */
object DividerDefaults {
    /** Default thickness of a divider. */
    val Thickness: Dp = 1.dp

    /** Default color of a divider. */
    val color: ColorProvider @Composable get() = SavrGlanceColorScheme.outlineVariant
}
