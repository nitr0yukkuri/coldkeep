package com.anonymous.coldkeep

import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONObject

/** Optional Rust inference bridge. JS keeps a deterministic fallback if the .so is absent. */
class RustAudioClassifierModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  companion object {
    private val libraryLoaded: Boolean = runCatching {
      System.loadLibrary("coldkeep_ml")
    }.isSuccess
  }

  override fun getName() = "RustAudioClassifier"

  @ReactMethod
  fun isAvailable(promise: Promise) {
    promise.resolve(libraryLoaded)
  }

  @ReactMethod
  fun classifyWav(uri: String, promise: Promise) {
    if (!libraryLoaded) {
      promise.reject("RUST_UNAVAILABLE", "libcoldkeep_ml.so is not bundled")
      return
    }
    try {
      val path = resolvePath(uri)
      val json = JSONObject(nativeClassifyWav(path))
      if (json.has("error")) {
        promise.reject("RUST_INFERENCE_FAILED", json.optString("error"))
        return
      }
      val result = Arguments.createMap()
      result.putBoolean("containsWater", json.optBoolean("containsWater"))
      result.putDouble("waterConfidence", json.optDouble("waterConfidence"))
      putNullableDouble(result, "fillLevel", json, integer = true)
      putNullableDouble(result, "fillConfidence", json)
      putNullableBoolean(result, "icePresence", json)
      putNullableDouble(result, "iceConfidence", json)
      result.putString("iceStatus", json.optString("iceStatus", "untrained"))
      result.putString("engine", json.optString("engine", "rust"))
      result.putInt("modelVersion", json.optInt("modelVersion", 1))
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("RUST_INFERENCE_FAILED", error.message, error)
    }
  }

  private fun resolvePath(uri: String): String {
    val parsed = Uri.parse(uri)
    return when (parsed.scheme) {
      null -> uri
      "file" -> parsed.path ?: throw IllegalArgumentException("file URI has no path")
      else -> throw IllegalArgumentException("Rust bridge only accepts file:// WAV paths")
    }
  }

  private fun putNullableBoolean(
    map: com.facebook.react.bridge.WritableMap,
    key: String,
    json: JSONObject,
  ) {
    if (json.isNull(key)) map.putNull(key) else map.putBoolean(key, json.optBoolean(key))
  }

  private fun putNullableDouble(
    map: com.facebook.react.bridge.WritableMap,
    key: String,
    json: JSONObject,
    integer: Boolean = false,
  ) {
    if (json.isNull(key)) {
      map.putNull(key)
    } else if (integer) {
      map.putInt(key, json.optInt(key))
    } else {
      map.putDouble(key, json.optDouble(key))
    }
  }

  private external fun nativeClassifyWav(path: String): String
}
