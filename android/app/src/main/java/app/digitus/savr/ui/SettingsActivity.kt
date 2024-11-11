package app.digitus.savr.ui

import app.digitus.savr.ui.PreferencesScreen
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.documentfile.provider.DocumentFile
import androidx.preference.Preference
import androidx.preference.PreferenceFragmentCompat
import app.digitus.savr.SavrApplication.Companion.appDataDir
import app.digitus.savr.R
import app.digitus.savr.ui.theme.SavrTheme
import app.digitus.savr.utils.PREFS_KEY_DATADIR
import app.digitus.savr.utils.LOGTAG
import app.digitus.savr.utils.PREFS_FILENAME
import app.digitus.savr.utils.arePermissionsGranted
import app.digitus.savr.utils.getChosenTheme
import app.digitus.savr.utils.prefsGetString
import app.digitus.savr.utils.prefsStoreString
import app.digitus.savr.utils.setDirectories


class SettingsActivity : AppCompatActivity() {

//    var fontSizeModifier = mutableStateOf(prefsGetInt(applicationContext, PREFS_KEY_FONT_SIZE_MODIFIER))

    fun openDocumentTree() {
        prefsStoreString(applicationContext, PREFS_KEY_DATADIR, "")
        val uriString = prefsGetString(applicationContext, PREFS_KEY_DATADIR)
        when {
            uriString == null || uriString == "" -> {
                Log.w(LOGTAG, "uri not stored")
                askPermissionDir()
            }
            arePermissionsGranted(applicationContext, uriString) -> {   }
            else -> {
                Log.w(LOGTAG, "uri permission not stored")
                askPermissionDir()
            }
        }
    }

    private val getDataDirResult =
        registerForActivityResult(
            ActivityResultContracts.StartActivityForResult()) {
            if (it.resultCode == Activity.RESULT_OK){

                val data = it.data

                if (data != null) {
                    //this is the uri user has provided us
                    val treeUri: Uri? = data.data
                    if (treeUri != null) {
                        Log.i(LOGTAG, "giving access to URI: ${treeUri.toString()}")
                        // here we should do some checks on the uri, we do not want root uri
                        // because it will not work on Android 11, or perhaps we have some specific
                        // folder name that we want, etc
                        if (Uri.decode(treeUri.toString()).endsWith(":")){
                            Toast.makeText(applicationContext,"Cannot use root folder!", Toast.LENGTH_SHORT).show()
                            // consider asking user to select another folder
//                            return
                        } else {
                            val takeFlags: Int = Intent.FLAG_GRANT_READ_URI_PERMISSION or
                                    Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                            contentResolver.takePersistableUriPermission(
                                treeUri,
                                takeFlags
                            )

                            // we should store the string fo further use
                            prefsStoreString(applicationContext, PREFS_KEY_DATADIR, treeUri.toString())

                            //Finally, we can do our file operations
                            //Please note, that all file IO MUST be done on a background thread. It is not so in this
                            //sample - for the sake of brevity.
//                    makeDoc(treeUri)

                            val dir = DocumentFile.fromTreeUri(this, treeUri)

                            //        if (dir == null || !dir.exists()) {
//            //the folder was probably deleted
//            Log.e(LOGTAG, "no Dir")
//            //according to Commonsware blog, the number of persisted uri permissions is limited
//            //so we should release those we cannot use anymore
//            //https://commonsware.com/blog/2020/06/13/count-your-saf-uri-permission-grants.html
//            releasePermissions(dirUri)
//            //ask user to choose another folder
//            Toast.makeText(applicationContext,"Folder deleted, please choose another!",Toast.LENGTH_SHORT).show()
//            openDocumentTree()
//        }

                            if (dir != null) {
                                val files = dir.listFiles()
                                Log.d(LOGTAG, files.map { it.name }.toString())
                            }

                            setDirectories(applicationContext)
                        }
                    }
                }
            }
        }

    // this will present the user with folder browser to select a folder for our data
    private fun askPermissionDir() {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
        getDataDirResult.launch(intent)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            var themeState by remember { mutableStateOf(getChosenTheme(applicationContext)) }

            SavrTheme(themeState) {
                PreferencesScreen(
                    onBack = { finish() },
                    onClickSetDir = { openDocumentTree() },
                    onThemeChange = { themeState=it }
                )
            }
        }

        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        setDirectories(applicationContext)
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }

}

