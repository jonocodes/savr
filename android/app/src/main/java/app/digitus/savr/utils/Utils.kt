package app.digitus.savr.utils


import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.os.Build
import android.util.Log
import android.webkit.MimeTypeMap
import android.widget.Toast
import androidx.documentfile.provider.DocumentFile
import app.digitus.savr.R
import app.digitus.savr.SavrApplication.Companion.appDataDir
import app.digitus.savr.SavrApplication.Companion.appSavesDir
import app.digitus.savr.data.JsonDb
import app.digitus.savr.model.Article
import app.digitus.savr.model.ArticleAndRender
import app.digitus.savr.model.ArticleRenderExtra
import app.digitus.savr.model.ReadabilityResult
import com.github.mustachejava.DefaultMustacheFactory
import com.google.gson.Gson
import com.google.gson.GsonBuilder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import java.io.BufferedReader
import java.io.FileNotFoundException
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.InputStreamReader
import java.io.OutputStream
import java.io.StringWriter
import java.net.URI
import java.net.URL
import java.text.Normalizer
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale


const val PREFS_FILENAME = "app.digitus.savr.prefs"
const val PREFS_KEY_DATADIR = "folder_uri"
const val PREFS_KEY_FONT_SIZE_MODIFIER = "font_size_modifier"
const val PREFS_KEY_THEME = "theme"

const val DEFAULT_ARTICLE_FONTSIZE_PX = 20

const val LOGTAG = "Savr"

val JS_SCRIPT_READABILITY = """
    let readabilityResult = new Readability(document).parse();

    if (readabilityResult === null) {
      throw new Error('Readability did not parse');
    }

    readabilityResult

    """.trimIndent()


class DbCreationException(message: String="") : Exception(message)


fun toUrlSlug(title: String): String {
    // Normalize the string and remove diacritics (accents)
    val normalizedTitle = Normalizer.normalize(title, Normalizer.Form.NFD)
        .replace("\\p{InCombiningDiacriticalMarks}+".toRegex(), "")

    // Convert to lowercase, trim spaces, replace spaces with hyphens, and remove non-alphanumeric characters
    var slug = normalizedTitle.lowercase(Locale.getDefault())
        .trim()
        .replace("\\s+".toRegex(), "-")
        .replace("[^a-z0-9-]".toRegex(), "")

    // Limit the slug to 64 characters
    if (slug.length > 64) {
        slug = slug.substring(0, 64).trimEnd('-')
    }

    return slug
}


fun prefsStoreString(context: Context, key: String, text: String) {
    val pref = context.getSharedPreferences(PREFS_FILENAME, 0) ?: error("Error getting preference $key")
    val editor = pref.edit()
    editor.putString(key, text)
    editor.apply()
}

fun prefsStoreInt(context: Context, key: String, value: Int) {
    val pref = context.getSharedPreferences(PREFS_FILENAME, 0) ?: error("Error getting preference $key")
    val editor = pref.edit()
    editor.putInt(key, value)
    editor.apply()
}


fun getChosenTheme(context: Context): String {
    return prefsGetString(context, PREFS_KEY_THEME) ?: "Follow system"
}

fun prefsGetString(context: Context, key: String): String? {
    val text = context.getSharedPreferences(PREFS_FILENAME, 0).getString(key, null)
    return text
}

fun prefsGetInt(context: Context, key: String): Int {
    return context.getSharedPreferences(PREFS_FILENAME, 0).getInt(key, 0)
}

fun arePermissionsGranted(context: Context, uriString: String): Boolean {
    // list of all persisted permissions for our app
    val list = context.contentResolver.persistedUriPermissions
    for (i in list.indices) {
        val persistedUriString = list[i].uri.toString()
        //Log.d(LOGTAG, "comparing $persistedUriString and $uriString")
        if (persistedUriString == uriString && list[i].isWritePermission && list[i].isReadPermission) {
            //Log.d(LOGTAG, "permission ok")
            return true
        }
    }
    return false
}


fun getAppVersionInfo(context: Context): String {
    val packageInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        context.packageManager.getPackageInfo(context.packageName, PackageManager.PackageInfoFlags.of(0))
    } else {
        @Suppress("DEPRECATION")
        context.packageManager.getPackageInfo(context.packageName, 0)
    }

    val versionName = packageInfo.versionName
    val versionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        packageInfo.longVersionCode
    } else {
        @Suppress("DEPRECATION")
        packageInfo.versionCode.toLong()
    }

    return "Version Name: $versionName, Version Code: $versionCode"
}


fun setDirectories(context: Context) {

//    Read stored preference for directory locations and store in a global

    // NOTE: the following is for testing a fresh install
//    val editor = context.getSharedPreferences(PREFS_FILENAME, 0)!!.edit()
//    editor.remove(PREFS_KEY_DATADIR)

//    prefsStoreString(context, PREFS_KEY_DATADIR, "")
    val dataDirStr = prefsGetString(context, PREFS_KEY_DATADIR)

    appDataDir = null

    if (dataDirStr != null && dataDirStr != "") {
        val dataDirUri = Uri.parse(dataDirStr)
        appDataDir = DocumentFile.fromTreeUri(context, dataDirUri)
    }

    if (appDataDir == null) {
//        throw AssertionError("Error finding data directory")
//            TODO: error?
    } else if (appDataDir?.exists() ?:false) {
        if (appDataDir?.isDirectory() ?: false) {
            appSavesDir = appDataDir?.findFile("saves")
        } else if (appDataDir?.isFile ?: false) {
            // TOOD: error
            throw AssertionError("Error: Chosen data directory is a file, not a directory.")
        }

        if (appSavesDir == null){
            appSavesDir = appDataDir?.createDirectory("saves")
        }
    }

    Log.i(LOGTAG, "appDataDir ${appDataDir?.name}")
    Log.i(LOGTAG, "appSavesDir ${appSavesDir?.name}")

}



fun createFileText(context: Context, filename: String, content: String, slug: String, mimeType: String ="*/html"): Boolean {

    if (appSavesDir == null) {
        throw AssertionError("Error accessing saves directory")
    }

    var articleDir = appSavesDir?.findFile(slug)

    if (articleDir == null) {
        articleDir = appSavesDir?.createDirectory(slug)

        if (articleDir == null) {
            throw AssertionError("Error creating article directory")
        }
        Log.i(LOGTAG, "created article dir: ${articleDir.name}")
    }

    val existingFile = articleDir.findFile(filename)

    if (existingFile != null && existingFile.isFile) {
        existingFile.delete()
    }

    val file = articleDir.createFile(mimeType, filename)
    if (file != null && file.canWrite()) {
        Log.d(LOGTAG, "file.uri = ${file.uri.toString()}")
        if (!writeText(context, file.uri, content)) {
            throw AssertionError("Error writing to article file")
        }
        Log.d(LOGTAG, "finished writing file $filename")
    } else {
        Log.d(LOGTAG, "can not create file")
        //consider showing some more appropriate error message
        throw AssertionError("Error saving article content")
//        Toast.makeText(context,"Write error!", Toast.LENGTH_SHORT).show()
    }

    return true

}


//Just a test function to write something into a file, from https://developer.android.com
//Please note, that all file IO MUST be done on a background thread. It is not so in this
//sample - for the sake of brevity.
fun writeText(context: Context, uri: Uri, content: String): Boolean {
    try {

        // overwrite file if it exists
        context.contentResolver.openFileDescriptor(uri, "wt")?.use { parcelFileDescriptor ->
            FileOutputStream(parcelFileDescriptor.fileDescriptor).use {
                it.write(
                    content.toByteArray()
                )

//                runOnUiThread {
//                    Toast.makeText(context, "File Write OK!", Toast.LENGTH_SHORT)
//                        .show()
//                }
            }
        }

        return true
    } catch (e: FileNotFoundException) {
        e.printStackTrace()
    } catch (e: IOException) {
        e.printStackTrace()
    }
    return false
}

@Throws(IOException::class)
fun readTextFromUri(context: Context, uri: Uri): String {
    val inputStream = context.contentResolver.openInputStream(uri)
    val reader = BufferedReader(
        InputStreamReader(
            inputStream
        )
    )
    val stringBuilder = StringBuilder()
    var line: String?
    while ((reader.readLine().also { line = it }) != null) {
        stringBuilder.append(line)
    }
    inputStream?.close()
    return stringBuilder.toString()
}

//
//fun formatHtmlRoot(article: Article, html: String?): String {
//
//    var byline = ""
//
//    if (article.author != null) {
//        byline = """<div id="savr-byline">${article.author}</div>"""
//    }
//
//    return """
//          <div id="savr-root">
//            <div id="savr-metadata">
//                <h1 id="savr-title">${article.title}</h1>
//                ${byline}
//                <div id="savr-published">${article.domain()} • ${article.publishedDateReadable() ?: ""}</div>
//                <div id="savr-readTime">${article.readTimeMinutes} minute read</div>
//            </div>
//            <hr />
//            ${html}
//          </div>
//      """
//}
//
//
//fun formatHtmlRootCompressed(article: Article, html: String?): String {
//
//    var metaSubhead = """<a href="${article.url}">${article.domain()}</a> • ${article.readTimeMinutes} min"""
//
//    if (article.author != null) {
//        metaSubhead = "By <b>${article.author}</b> • $metaSubhead"
//    }
//    metaSubhead = """<div id="savr-published">$metaSubhead</div>"""
//
//    var metaDate = ""
//
//    var renderedDate = article.publishedDateReadable()
//    if (renderedDate != null) {
//        metaDate = """<div id="savr-readTime">$renderedDate</div>"""
//    }
//
//    return """
//          <div id="savr-root">
//            <div id="savr-metadata">
//                    <h1 id="savr-title">${article.title}</h1>
//                    ${metaSubhead}
//                    ${metaDate}
//            </div>
//            <hr />
//            ${html}
//          </div>
//      """
//}


//
//fun formatHtmlForLocal(article: Article, html: String?): String {
//
//    val formatted = """
//      <!DOCTYPE html>
//      <head>
//       <title>
//          Savr - ${article.title}
//       </title>
//       <meta content="text/html; charset=UTF-8" http-equiv="content-type">
//       <link rel="stylesheet" href="../local.css">
//
//       <!--
//        savr metadata
//            download platform: android
//            parser: readability
//       -->
//
//       </head>
//
//       <body>
//       ${formatHtmlRootCompressed(article, html)}
//       </body></html>
//      """
//
//    return formatted
//}
//
//
//fun formatHtmlAndroid(article: Article, html: String?, fontSize: Int, theme: String = "light"): String {
//
//    return """
//      <!DOCTYPE html>
//      <head>
//        <meta content="text/html; charset=UTF-8" http-equiv="content-type">
//        <link rel="stylesheet" href="file:///android_asset/android.css">
//        <link rel="stylesheet" href="file:///android_asset/${theme}.css">
//        <style>
//            #savr-root { font-size: ${fontSize}px; }
//        </style>
//      </head>
//
//      <body>
//      ${formatHtmlRootCompressed(article, html)}
//      </body></html>
//      """
//}


fun renderTemplate(context: Context, templateName: String, data: Map<String, Any?>): String {

    val path = "shared/templates/${templateName}.mustache"

    val mustacheFactory = DefaultMustacheFactory()
    val templateStream = context.assets.open(path)
    val mustache = mustacheFactory.compile(templateStream.reader(), path)

    val writer = StringWriter()
    mustache.execute(writer, data).flush()

    return writer.toString()
}

fun formatIsoDate(isoTimestamp: String): String {
    // Parse the ISO timestamp to ZonedDateTime
    val zonedDateTime = ZonedDateTime.parse(isoTimestamp)

    // TODO: use a localized format
    val dateFormatter = DateTimeFormatter.ofPattern("MMMM d, yyyy")
    return dateFormatter.format(zonedDateTime)
}


fun extractDomain(url: String?): String? {
    return try {
        val uri = URI(url)
        uri.host
    } catch (e: Exception) {
        null
    }
}

fun renderArticleHtml(context: Context, article: Article, content: String?, fontSize: Int? = null, theme: String = "light"): String {

    //fun formatHtmlAndroid(article: Article, html: String?, fontSize: Int, theme: String = "light"): String {
//
    //        <link rel="stylesheet" href="file:///android_asset/android.css">
//        <link rel="stylesheet" href="file:///android_asset/${theme}.css">
//        <style>
//            #savr-root { font-size: ${fontSize}px; }
//        </style>

    var head = ""

    if (fontSize != null) {
        head = """
            <link rel="stylesheet" href="file:///android_asset/android.css">
            <link rel="stylesheet" href="file:///android_asset/${theme}.css">
            <style>
                #savr-root { font-size: ${fontSize}px; }
            </style>
        """.trimIndent()
    }

    val domain = extractDomain(article.url);

    var pubDate: String? = null

    if (article.publishedDate != null)
        pubDate = formatIsoDate(article.publishedDate)

    val data = mapOf(

        "slug" to article.slug,
        "title" to article.title,
        "url" to article.url,
        "state" to article.state,
        "content" to content,
        "head" to head,

        "published" to "<a href=${article.url}>${domain}</a> &#x2022; ${pubDate}",
        "readTime" to "${article.readTimeMinutes} minute read",
        "byline" to article.author,
    )

    val rendered = renderTemplate(context, "article", data)

    return rendered
}


fun generateInfoForCard(article: Article): String {

    var result = ""

    if (article.author != null && article.author != "") {
        result = article.author
    }

    if (article.publishedDate != null) {

        val pubDate = formatIsoDate(article.publishedDate)

        result = if (result == "") {
            pubDate
        } else {
            "$result, $pubDate"
        }

    }

    return result
}


fun copyStream(input: InputStream, output: OutputStream) {
    val buffer = ByteArray(1024)
    var length: Int
    while (input.read(buffer).also { length = it } > 0) {
        output.write(buffer, 0, length)
    }
}

fun copyStaticFiles(context: Context) {

    var targetDir = appDataDir?.findFile("static")

    if (targetDir == null) {
        targetDir = appDataDir?.createDirectory("static") ?: error("Cant create static directory")

    }
    copyAssetsDirectory(context, "shared/static", targetDir)

}

//fun copyFile(context: Context, sourceUri: Uri, targetUri: Uri) {
//    try {
//        // Open input stream to read from the source URI
//        val inputStream: InputStream? = context.contentResolver.openInputStream(sourceUri)
//        // Open output stream to write to the target URI
//        val outputStream: OutputStream? = context.contentResolver.openOutputStream(targetUri)
//
//        if (inputStream != null && outputStream != null) {
//            // Buffer for efficient copying
//            val buffer = ByteArray(1024)
//            var bytesRead: Int
//
//            // Read from input and write to output
//            while (inputStream.read(buffer).also { bytesRead = it } != -1) {
//                outputStream.write(buffer, 0, bytesRead)
//            }
//
//            // Close the streams
//            inputStream.close()
//            outputStream.close()
//        }
//    } catch (e: Exception) {
//        e.printStackTrace()
//        // Handle error if needed
//    }
//}

fun getMimeTypeFromFilename(fileName: String): String {
    // Extract the file extension
    val extension = fileName.substringAfterLast('.', "").lowercase()

    // Use MimeTypeMap to get the MIME type
    return MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension) ?: "text/plain"
}

fun copyAssetsDirectory(context: Context, assetDir: String, targetDir: DocumentFile) {
    val assetManager = context.assets
    val files = assetManager.list(assetDir) ?: return

    for (fileName in files) {
        val assetPath = "$assetDir/$fileName"
        var targetFile = targetDir.findFile(fileName)

        val mimeType = getMimeTypeFromFilename(fileName)

        if (targetFile != null && targetFile.exists()) {
            targetFile.delete()
        }

        targetFile = targetDir.createFile(mimeType, fileName)

        Log.d(LOGTAG, "copying asset to ${targetFile?.uri}")

        if (targetFile != null) {
            val inputStream: InputStream = context.assets.open(assetPath)

            val outputStream = context.contentResolver.openOutputStream(targetFile.uri)

            if (outputStream != null) {
                copyStream(inputStream, outputStream)
            }
        }

    }
}

fun getByline(article: Article): String {

    val uri = URI(article.url)
    val domain: String = uri.host.removePrefix("www.")

    if (article.author == null) {
        return domain
    }
    return article.author
}



fun toArticleAndRender(article: Article): ArticleAndRender {

    val extra = ArticleRenderExtra(infoForCard = generateInfoForCard(article))

    return ArticleAndRender(
        article=article,
        extra
    )
}

fun articlesToRender(articles: List<Article>): Pair<List<ArticleAndRender>, List<ArticleAndRender>> {

    val readable = mutableListOf<ArticleAndRender>()
    val archived = mutableListOf<ArticleAndRender>()

    for (article in articles) {

        val articleAndRender = toArticleAndRender(article)

        if (article.state == "archived")
            archived.add(articleAndRender)
        else if (article.state != "deleted")
            readable.add(articleAndRender)
    }

    return Pair(readable, archived)
}


fun createLocalHtmlList(context: Context) {

    val rootPath = "."

    val allArticles = JsonDb(context).getEverything()

    val (readable, archived) = articlesToRender(allArticles.articles)

    val data = mapOf(
        "readable" to readable,
        "archived" to archived,
        "namespace" to rootPath,
        "static" to true,

//        "isArchived" to { article: Article -> article.state == "archived" },
//        "isReadable" to {
//            article: Article -> (article.state != "archived" && article.state != "deleted")
//                        },
//        "infoForCard" to { article: Article -> generateInfoForCard(article) },
    )

    val rendered = renderTemplate(context, "list", data)

    var file = appDataDir?.findFile("list.html")
    if (file != null && file.exists()) {
        file.delete()
    }

    file = appDataDir?.createFile("text/html", "list.html")
    if (file != null && file.canWrite()) {
        Log.d(LOGTAG, "file.uri = ${file.uri.toString()}")
        if (!writeText(context, file.uri, rendered)) {
            throw AssertionError("Error writing to list file")
        }
        Log.d(LOGTAG, "finished writing file list.html")
    } else {
        Log.d(LOGTAG, "can not create file")
        throw AssertionError("Error saving list content")
    }

    copyStaticFiles(context)
}

fun readFromAsset(context: Context, name: String): String {

    var string = ""

    try {
        val inputStream: InputStream = context.assets.open(name)
        val size = inputStream.available()
        val buffer = ByteArray(size)
        inputStream.read(buffer)
        string = String(buffer)
    } catch (e: IOException) {
        e.printStackTrace()
    }

    return string
}


fun calcReadingTime(text: String): Int {

    val wordCount = text.split("\\s+".toRegex()).size

    val wordsPerMinute = 200  // adjust this value if needed

    val readingTimeMinutes = wordCount.toDouble() / wordsPerMinute

    val roundedReadingTime = kotlin.math.ceil(readingTimeMinutes).toInt()

//    println("Estimated reading time: $roundedReadingTime minute(s)")
    return roundedReadingTime
}

fun readabilityToArticleMeta(readabilityResult: ReadabilityResult, url: String) : Article {

//    val content = readabilityResult.content ?: error("Null article content")
    val title = readabilityResult.title
    val date = readabilityResult.publishedTime
    val author = readabilityResult.byline

    val slug = toUrlSlug(title)

    val currentDateTimeWithZone = ZonedDateTime.now()

    // Format it as an ISO 8601 string with timezone information
    val nowString = currentDateTimeWithZone.format(DateTimeFormatter.ISO_INSTANT)

    val article = Article(
        title = title,
        slug = slug,
        url = url,
        state = "unread",
        author = author,
        readTimeMinutes = calcReadingTime(readabilityResult.textContent  ?: error("Empty article text content")),
        publishedDate = date,
        ingestPlatform = "android",
        ingestDate = nowString,
        ingestSource = "url",
        mimeType = "text/html"
    )

    return article
}

fun shareArticle(article: Article, context: Context) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TITLE, article.title)
        putExtra(Intent.EXTRA_TEXT, article.url)
    }
    context.startActivity(
        Intent.createChooser(
            intent,
            context.getString(R.string.article_share)
        )
    )
}

fun deleteArticle(article: Article, context: Context) {
    JsonDb(context).deleteArticle(article)

    val articleDir = appSavesDir?.findFile(article.slug)
    articleDir?.delete()
}

fun archiveArticle(article: Article, context: Context) {
    JsonDb(context).archiveArticle(article)

    createLocalHtmlList(context)

    createLocalHtmlList(context)
}

fun unarchiveArticle(article: Article, context: Context) {
    JsonDb(context).archiveArticle(article, true)
    createLocalHtmlList(context)
//    TODO: refresh should really be happening here
}


fun parseReadabilityDate(dateTimeString: String): ZonedDateTime? {

    // Here are examples found in Readability. We try to parse in this order.
    // "2015-03-27T13:07:55.096Z",
    // "2015-10-15T08:00:26+00:00",
    // "2017-11-24T18:42:20.314667",
    // "2018-04-05T06:00",
    // "2024-06-25",

//    if (dateTimeString == null) {
//        return null
//    }

    try {
        val parsed = ZonedDateTime.parse(dateTimeString)
        return parsed
    } catch (e: DateTimeParseException) {

        try {
            val parsed = LocalDateTime.parse(dateTimeString)
            val updated = ZonedDateTime.of(parsed, ZoneId.of("UTC"))
            return updated
        } catch (e: DateTimeParseException) {

            try {
                val dateString = dateTimeString?.substring(0, 10)
                val parsed = LocalDate.parse(dateString)
                val updated = ZonedDateTime.of(parsed.atTime(0, 0), ZoneId.of("UTC"))
                return updated
            } catch (e: Exception) {

                Log.d(LOGTAG, "Unable to parse datetime string $dateTimeString")
                return null
            }
        }
    }

}



data class ImageData(val imageUrl: String, val modifiedPath: String, val imgElement: Element, val imageFormat: Bitmap.CompressFormat)

fun getBaseDirectory(articleUrl: String): String {
    val url = URL(articleUrl)
    return if (url.path.endsWith("/")) {
        articleUrl
    } else {
        articleUrl.substring(0, articleUrl.lastIndexOf('/') + 1)
    }
}

fun determineImageFormat(imageUrl: String): Bitmap.CompressFormat {
    return when {
        imageUrl.endsWith(".png", ignoreCase = true) -> Bitmap.CompressFormat.PNG
        imageUrl.endsWith(".webp", ignoreCase = true) -> Bitmap.CompressFormat.WEBP
        else -> Bitmap.CompressFormat.JPEG // Default to JPEG if not specified
    }
}

fun extractImageUrls(doc: Document, articleUrl: String?): List<ImageData> {
    val imgElements = doc.select("img")
    val baseDirectory = articleUrl?.let { getBaseDirectory(it) }
    val imgData = mutableListOf<ImageData>()

    for (img in imgElements) {
        var imgUrl = img.attr("src")

        try {
            // handle relative url images
            if (baseDirectory != null && !imgUrl.matches(Regex("^[a-zA-Z]+://.*"))) {
                imgUrl = URL(URL(baseDirectory), imgUrl).toString()
            }

            val imageFormat = determineImageFormat(imgUrl)

            val pathWithoutProtocol = imgUrl.replace(Regex("^[a-zA-Z]+://"), "")

            val modifiedPath = pathWithoutProtocol.replace(Regex("[^a-zA-Z0-9_]"), "_") +
                    "." + imageFormat.name.lowercase()

            imgData.add(ImageData(imgUrl, modifiedPath, img, imageFormat))

        } catch (e: Exception) {
            Log.e(LOGTAG, "Error processing image $imgUrl")
            Log.e(LOGTAG, e.stackTraceToString())
        }

    }

    return imgData
}

class ScrapeException(message: String, cause: java.lang.Exception) : Exception(message, cause)


fun resizeBitmap(image: Bitmap, maxWidth: Int, maxHeight: Int): Bitmap {
    val width = image.width
    val height = image.height

    if (image.width < maxWidth && image.height < maxHeight) {
        return image
    }

    val scale = minOf(maxWidth.toDouble() / width, maxHeight.toDouble() / height)
    val newWidth = (width * scale).toInt()
    val newHeight = (height * scale).toInt()

    return Bitmap.createScaledBitmap(image, newWidth, newHeight, true)
}

fun resizeBitmapSquare(bitmap: Bitmap, size: Int): Bitmap {
    val width = bitmap.width
    val height = bitmap.height

    // Calculate the scale factor to maintain aspect ratio and fit into the square size
    val scale = size.toFloat() / minOf(width, height)

    // Create a matrix for the scaling
    val matrix = Matrix().apply {
        setScale(scale, scale)
    }

    // Resize the bitmap using the scale matrix
    val scaledBitmap = Bitmap.createBitmap(bitmap, 0, 0, width, height, matrix, true)

    // Crop the scaled bitmap to ensure it's a square of the desired size
    val xOffset = (scaledBitmap.width - size) / 2
    val yOffset = (scaledBitmap.height - size) / 2

    return Bitmap.createBitmap(scaledBitmap, xOffset, yOffset, size, size)
}

suspend fun downloadAndResizeImages(
    context: Context,
    imageData: List<ImageData>,
    outputDirUri: Uri,
    onProgress: (Int, String) -> Unit,
    maxDimension: Int
) = withContext(Dispatchers.IO) {

    val httpClient = OkHttpClient()
    val contentResolver = context.contentResolver
    val outputDir = DocumentFile.fromTreeUri(context, outputDirUri) ?: return@withContext

    val imageCount = imageData.size

    if (imageCount == 0)
        return@withContext

    val startPercent = 30
    val endPercent = 95
    val stepSize = (endPercent - startPercent) / imageCount / 2
    var percentComplete = startPercent

    for ((index, data) in imageData.withIndex()) {
        try {

            onProgress(percentComplete, "image ${index+1} of $imageCount - fetching")

            val request = Request.Builder().url(data.imageUrl).build()
            val response = httpClient.newCall(request).execute()

            percentComplete += stepSize

            onProgress(percentComplete, "image ${index+1} of $imageCount - processing")

            response.body?.byteStream()?.use { inputStream ->
                val originalBitmap = BitmapFactory.decodeStream(inputStream)
                val resizedBitmap = resizeBitmap(originalBitmap, maxDimension, maxDimension)

                val outputFile = outputDir.createFile("image/${data.imageFormat.name.lowercase()}", data.modifiedPath)

                val localPath = outputDir.name + "/" + outputFile?.name

                outputFile?.uri?.let { uri ->
                    contentResolver.openOutputStream(uri)?.use { outStream ->
                        resizedBitmap.compress(data.imageFormat, 90, outStream)
                    }

                    // Update the src attribute of the img element in the document
//                    data.imgElement.attr("src", uri.toString())
//                    data.imgElement.attr("src", localPath)
                    data.imgElement.attr("data-local-path", localPath)
                }

            }

            percentComplete += stepSize
        } catch (e: Exception) {
            throw ScrapeException("Error downloading or resizing image from ${data.imageUrl}: $e", e)
        }
    }
}

fun getThumbnail(context: Context, article: Article): Bitmap? {
    val articleDir = appSavesDir?.findFile(article.slug)
    val imagesDir = articleDir?.findFile("images") ?: return null
    val file = imagesDir.findFile("thumbnail.webp") ?: return null

    val inputStream = context.contentResolver.openInputStream(file.uri)
    val bitmap = BitmapFactory.decodeStream(inputStream)
    return bitmap
}

// credit: https://github.com/reddit-archive/reddit/blob/753b17407e9a9dca09558526805922de24133d53/r2/r2/lib/media.py#L706
fun createThumbnail(
        context: Context,
        imageData: List<ImageData>,
        outputDirUri: Uri,
        ): ImageData? {

    val maxDimensionThumb = 200

    // find the largest and squarest image as the thumbnail
    var thumbnail: ImageData? = null
    var largestArea = 0

    val outputDir = DocumentFile.fromTreeUri(context, outputDirUri) ?: return null

    for (data in imageData) {

        val downloadedFile = outputDir.findFile(data.modifiedPath) ?: continue

        val inputStream = context.contentResolver.openInputStream(downloadedFile.uri)
        val downloadedBitmap = BitmapFactory.decodeStream(inputStream) ?: continue

        var area = downloadedBitmap.width * downloadedBitmap.height

        // ignore small images
        if (area < 5000) {
            Log.i(LOGTAG, "thumb ignore small: ${data.modifiedPath}")
            continue
        }

        // penalize excessively long/wide images
        val ratio = Math.max(downloadedBitmap.width, downloadedBitmap.height) /
                Math.min(downloadedBitmap.width, downloadedBitmap.height)
        if (ratio > 1.5) {
            Log.i(LOGTAG, "thumb penalizing long/wide: ${data.modifiedPath}")
            area /= ratio * 2
        }

        // penalize images with "sprite" in their name
        if (data.modifiedPath.contains("sprite")) {
            Log.i(LOGTAG, "thumb penalizing sprite: ${data.modifiedPath}")
            area /= 10
        }

        if (area > largestArea) {
            largestArea = area
            thumbnail = data
        }
    }

//    create thumbnail

    if (thumbnail == null) return null

    val downloadedFile = outputDir.findFile(thumbnail.modifiedPath) ?: error("Thumbnail stream not found")
    val inputStream = context.contentResolver.openInputStream(downloadedFile.uri)

    val outputFile = outputDir.createFile("image/webp", "thumbnail.webp")

    val originalBitmap = BitmapFactory.decodeStream(inputStream)
    val resizedBitmap = resizeBitmapSquare(originalBitmap, maxDimensionThumb)

    outputFile?.uri?.let { uri ->
        val contentResolver = context.contentResolver.openOutputStream(uri)?.use { outStream ->

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                resizedBitmap.compress(
                    Bitmap.CompressFormat.WEBP_LOSSLESS, // or WEBP_LOSSY
                    100, outStream
                )
            } else {
                resizedBitmap.compress(Bitmap.CompressFormat.WEBP, 100, outStream)
            }
        }
    }

    return thumbnail
}



fun updateImageSrc(doc: Document, imageData: List<ImageData>, outputDir: Uri) {
    for (data in imageData) {
        val localPath = data.imgElement.attr("data-local-path")
        if (localPath.isNotEmpty()) {
            data.imgElement.attr("src", localPath)
        }
    }
}

suspend fun processHtmlAndImages(
    context: Context,
    articleUrl: String?,
    htmlText: String,
    outputDirUri: Uri,
    onProgress: (Int, String) -> Unit,
    maxDimension: Int = 1024,
): String {
    val doc = Jsoup.parse(htmlText)
    val imageData = extractImageUrls(doc, articleUrl)

    downloadAndResizeImages(context, imageData, outputDirUri, onProgress, maxDimension)

    // Update the src attribute of the img elements in the document
    updateImageSrc(doc, imageData, outputDirUri)

    onProgress(96, "processing thumbnail")
    createThumbnail(context, imageData, outputDirUri)

    return doc.html()
}


suspend fun scrapeReadabilityAssets(
    context: Context,
    result: String?,
    url: String,
    onProgress: (Int, String) -> Unit) {

    if (result == null || result == "null") {
        Log.e(LOGTAG, "null readability result")
    } else {

        onProgress(30, "parsing")

        Log.d("callback_result", result)

        val readabilityResult: ReadabilityResult =
            Gson().fromJson(result, ReadabilityResult::class.java)

        var article = readabilityToArticleMeta(readabilityResult, url)
        article.ingestPlatform = "${article.ingestPlatform} (${getAppVersionInfo(context)})"

        try {

            if (JsonDb(context).articleInDb(article) != null)
                throw Exception("Article already exists")

            createFileText(
                context,
                "readability.json",
                GsonBuilder().setPrettyPrinting().create()
                    .toJson(readabilityResult),
                article.slug
            )

//            createFileText(
//                context,
//                "readability.html",
//                readabilityResult.content ?: error("Parsed content is empty"),
//                article.slug
//            )

            val articleDir = appSavesDir?.findFile(article.slug)

            var imagesDir = articleDir?.findFile("images")

            if (imagesDir == null) {
                imagesDir = articleDir?.createDirectory("images") ?: error("Cant create images directory")
            }
            // TODO: else delete old dir contents?

            onProgress(40, "fetching images")

            val updatedHtml = processHtmlAndImages(
                context, article.url,
                readabilityResult.content, imagesDir.uri, onProgress
            )

            createFileText(
                context,
                "content.html",
                updatedHtml,
                article.slug
            )

            onProgress(98, "formatting")

            val html = renderArticleHtml(context, article, updatedHtml)

            JsonDb(context).addArticle(article)

            createFileText(context, "index.html", html, article.slug)

            createLocalHtmlList(context)

            Toast.makeText(
                context,
                "Article saved",
                Toast.LENGTH_LONG
            ).show()

//        } catch (e: ScrapeException) {
//            Log.e(LOGTAG, e.toString())
//            Log.e(LOGTAG, e.stackTraceToString())
//            Toast.makeText(
//                context,
//                "Error saving article: ${e.message}",
//                Toast.LENGTH_LONG
//            ).show()
        } catch (e: Exception) {
            Log.e(LOGTAG, e.toString())
            Log.e(LOGTAG, e.stackTraceToString())
            Toast.makeText(
                context,
                "Error saving article: ${e.message}",
                Toast.LENGTH_LONG
            ).show()
        } finally {
            onProgress(100, "done")
        }
    }
}

fun countArticleWords(context: Context, article: Article): Int {
    return 1002
}

fun countArticleFiles(context: Context, article: Article): Int {
    return 3
}

fun articleDirectorySize(context: Context, article: Article): String {
    return "123.4 Mb"
}