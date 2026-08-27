package com.anonymous.coldkeep

import android.Manifest

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent

import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import java.util.Calendar

/** Schedules the domain notification plan with Android's local notification APIs. */
class ColdKeepNotificationModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  companion object {
    const val CHANNEL_ID = "coldkeep-hydration"
    private const val PERMISSION_REQUEST_CODE = 4817
    private const val ACTION_SHOW = "com.anonymous.coldkeep.SHOW_NOTIFICATION"
    private const val DAILY_ID = "coldkeep-daily-brief"
    private const val REMINDER_ID = "coldkeep-hydration-reminder"
  }

  private var permissionPromise: Promise? = null


  override fun getName(): String = "ColdKeepNotifications"

  @ReactMethod
  fun requestPermission(promise: Promise) {
    ensureChannel()
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || hasNotificationPermission()) {
      promise.resolve(true)
      return
    }
    val activity = currentActivity
    if (activity == null) {
      promise.resolve(false)
      return
    }
    if (permissionPromise != null) {
      promise.reject("PERMISSION_REQUEST_IN_PROGRESS", "Notification permission is already being requested")
      return
    }
    val permissionAwareActivity = activity as? PermissionAwareActivity
    if (permissionAwareActivity == null) {
      promise.resolve(false)
      return
    }
    permissionPromise = promise
    permissionAwareActivity.requestPermissions(
      arrayOf(Manifest.permission.POST_NOTIFICATIONS),
      PERMISSION_REQUEST_CODE,
      PermissionListener { requestCode, _, grantResults ->
        if (requestCode != PERMISSION_REQUEST_CODE) {
          return@PermissionListener false
        }
        val pending = permissionPromise
        permissionPromise = null
        pending?.resolve(grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED)
        true
      },
    )
  }

  @ReactMethod
  fun sync(requests: ReadableArray, promise: Promise) {
    try {
      ensureChannel()
      cancelExisting()
      for (index in 0 until requests.size()) {
        if (requests.isNull(index)) continue
        val request = requests.getMap(index)
        schedule(request)
      }
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("NOTIFICATION_SYNC_FAILED", error.message, error)
    }
  }

  private fun hasNotificationPermission(): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
      ActivityCompat.checkSelfPermission(
        reactContext,
        Manifest.permission.POST_NOTIFICATIONS,
      ) == PackageManager.PERMISSION_GRANTED

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }
    val manager = reactContext.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(
      NotificationChannel(
        CHANNEL_ID,
        "水分・暑さ対策",
        NotificationManager.IMPORTANCE_DEFAULT,
      ).apply {
        description = "ColdKeepの水分補給リマインダー"
        setSound(null, null)
        enableVibration(false)
      },
    )
  }

  private fun cancelExisting() {
    val alarmManager = reactContext.getSystemService(AlarmManager::class.java)
    listOf(DAILY_ID, REMINDER_ID).forEach { id ->
      alarmManager.cancel(pendingIntent(id, null))
    }
  }

  private fun schedule(request: ReadableMap) {
    val id = request.getString("id") ?: return
    val title = request.getString("title") ?: return
    val body = request.getString("body") ?: return
    val schedule = request.getMap("schedule") ?: return
    val type = schedule.getString("type") ?: return
    val alarmManager = reactContext.getSystemService(AlarmManager::class.java)
    if (type == "daily") {
      val hour = schedule.getInt("hour").coerceIn(0, 23)
      val minute = schedule.getInt("minute").coerceIn(0, 59)
      val first = Calendar.getInstance().apply {
        set(Calendar.HOUR_OF_DAY, hour)
        set(Calendar.MINUTE, minute)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
        if (timeInMillis <= System.currentTimeMillis()) {
          add(Calendar.DAY_OF_YEAR, 1)
        }
      }
      alarmManager.setInexactRepeating(
        AlarmManager.RTC_WAKEUP,
        first.timeInMillis,
        AlarmManager.INTERVAL_DAY,
        pendingIntent(id, NotificationPayload(title, body)),
      )
      return
    }
    if (type == "once" && schedule.hasKey("atEpochMs")) {
      val at = schedule.getDouble("atEpochMs").toLong()
      if (at > System.currentTimeMillis()) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          alarmManager.setAndAllowWhileIdle(
            AlarmManager.RTC_WAKEUP,
            at,
            pendingIntent(id, NotificationPayload(title, body)),
          )
        } else {
          alarmManager.set(
            AlarmManager.RTC_WAKEUP,
            at,
            pendingIntent(id, NotificationPayload(title, body)),
          )
        }
      }
    }
  }

  private fun pendingIntent(id: String, payload: NotificationPayload?): PendingIntent {
    val intent = Intent(reactContext, ColdKeepNotificationReceiver::class.java).apply {
      action = ACTION_SHOW
      putExtra("notification_id", id)
      payload?.let {
        putExtra("notification_title", it.title)
        putExtra("notification_body", it.body)
      }
    }
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
    return PendingIntent.getBroadcast(reactContext, id.hashCode(), intent, flags)
  }

  private data class NotificationPayload(val title: String, val body: String)
}
