package app.digitus.savr.glance.ui.theme

import androidx.glance.color.ColorProvider
import androidx.glance.material3.ColorProviders
import app.digitus.savr.ui.theme.DarkColors
import app.digitus.savr.ui.theme.LightColors

object SavrGlanceColorScheme {
    val colors = ColorProviders(
        light = LightColors,
        dark = DarkColors
    )

    val outlineVariant = ColorProvider(
        day = LightColors.onSurface.copy(alpha = 0.1f),
        night = DarkColors.onSurface.copy(alpha = 0.1f)
    )
}
