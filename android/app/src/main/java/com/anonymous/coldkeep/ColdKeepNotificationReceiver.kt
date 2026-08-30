package com.anonymous.coldkeep

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/** Delivers alarms scheduled by ColdKeepNotificationModule. */
class ColdKeepNotificationReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val title = intent.getStringExtra("notification_title") ?: return
    val body = intent.getStringExtra("notification_body") ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      context.checkSelfPermission("android.permission.POST_NOTIFICATIONS") !=
        android.content.pm.PackageManager.PERMISSION_GRANTED
    ) {
      return
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.getSystemService(NotificationManager::class.java).createNotificationChannel(
        NotificationChannel(
          ColdKeepNotificationModule.CHANNEL_ID,
          "水分・暑さ対策",
          NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
          setSound(null, null)
          enableVibration(false)
        },
      )
    }
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, ColdKeepNotificationModule.CHANNEL_ID)
    } else {
      Notification.Builder(context)
    }
    val notification = builder
      .setSmallIcon(android.R.drawable.ic_popup_reminder)
      .setContentTitle(title)
      .setContentText(body)
      .setAutoCancel(true)
      .build()
    val notificationId = intent.getStringExtra("notification_id")?.hashCode() ?: title.hashCode()
    context.getSystemService(NotificationManager::class.java).notify(notificationId, notification)
  }
}
