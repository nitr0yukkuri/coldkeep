package com.anonymous.coldkeep

import android.content.ClipData
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

/** Shares private dataset files as a read-only content URI on Android. */
class FileShareModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "ColdKeepFileShare"

  @ReactMethod
  fun shareZip(uri: String, title: String, promise: Promise) {
    try {
      val parsed = Uri.parse(uri)
      val rawPath = parsed.path ?: uri
      val file = File(rawPath).canonicalFile
      val filesRoot = reactContext.filesDir.canonicalFile
      val cacheRoot = reactContext.cacheDir.canonicalFile
      if (!file.isFile || (!isWithin(file, filesRoot) && !isWithin(file, cacheRoot))) {
        throw IllegalArgumentException("Only an existing ColdKeep private file can be shared")
      }

      val contentUri = FileProvider.getUriForFile(
        reactContext,
        "${reactContext.packageName}.fileprovider",
        file,
      )
      val sendIntent = Intent(Intent.ACTION_SEND).apply {
        type = "application/zip"
        putExtra(Intent.EXTRA_STREAM, contentUri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        clipData = ClipData.newRawUri("ColdKeep dataset", contentUri)
      }
      val chooser = Intent.createChooser(sendIntent, title).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(chooser)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("FILE_SHARE_FAILED", error.message, error)
    }
  }

  private fun isWithin(file: File, root: File): Boolean {
    val rootPath = root.path + File.separator
    return file.path.startsWith(rootPath)
  }
}
