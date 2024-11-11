
package app.digitus.savr

import android.app.Application
import android.content.Context
import androidx.documentfile.provider.DocumentFile
import app.digitus.savr.data.AppContainer
import app.digitus.savr.data.AppContainerImpl


class SavrApplication : Application() {
    companion object {
        const val APP_URI = "https://github.com/jonocodes/savr-android"
        var appDataDir: DocumentFile? = null
        var appSavesDir: DocumentFile? = null
        var jsonDbFile: DocumentFile? = null
        var appContext: Context? = null // TODO: this is surely a bad idea
    }

    // AppContainer instance used by the rest of classes to obtain dependencies
    lateinit var container: app.digitus.savr.data.AppContainer

    override fun onCreate() {
        super.onCreate()
        container = app.digitus.savr.data.AppContainerImpl(this)
        app.digitus.savr.SavrApplication.Companion.appContext = this.applicationContext
    }
}
