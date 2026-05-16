package com.nawafhq.chatappandroid

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.content.ContextCompat
import androidx.core.content.LocusIdCompat
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import kotlin.math.absoluteValue

class ConversationShortcutModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "ConversationShortcut"

  @ReactMethod
  fun pushShortcut(
    shortcutId: String,
    personName: String,
    personIconUrl: String?,
    conversationId: String,
    promise: Promise
  ) {
    Thread {
      try {
        val context = reactApplicationContext
        val icon = loadAvatarIcon(personIconUrl)?: IconCompat.createWithAdaptiveBitmap(createInitialsBitmap(personName, shortcutId))

        publishConversationShortcut(
          context = context,
          shortcutId = shortcutId,
          personName = personName,
          personIcon = icon,
          conversationId = conversationId
        )

        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("SHORTCUT_ERROR", e.message, e)
      }
    }.start()
  }

  @SuppressLint("MissingPermission")
  @ReactMethod
  fun displayConversationNotification(options: ReadableMap, promise: Promise) {
    Thread {
      try {
        val context = reactApplicationContext
        val conversationId = requireString(options, "conversationId")
        val shortcutId = optionalString(options, "shortcutId") ?: "conversation_$conversationId"
        val channelId = optionalString(options, "channelId") ?: DEFAULT_CHANNEL_ID
        val title = optionalString(options, "title") ?: DEFAULT_TITLE
        val body = optionalString(options, "body") ?: ""
        val senderName = optionalString(options, "senderDisplayName") ?: title
        val senderId = optionalString(options, "senderId")
          ?: optionalString(options, "senderUserId")
          ?: senderName
        val senderAvatarUrl = optionalString(options, "senderAvatarUrl")
        val conversationTitle = optionalString(options, "conversationTitle")
        val isGroupConversation = optionalBoolean(options, "isGroupConversation")
          ?: (optionalString(options, "chatType") == "group")
        val timestamp = optionalDouble(options, "timestamp")?.toLong()
          ?: System.currentTimeMillis()
        val notificationId = notificationIdFor(shortcutId)
        val avatarBitmap = loadAvatarBitmap(senderAvatarUrl)?: createInitialsBitmap(senderName, senderId)
        val avatarIcon = avatarBitmap?.let { IconCompat.createWithAdaptiveBitmap(it) }

        ensureMessagesChannel(context, channelId)

        publishConversationShortcut(
          context = context,
          shortcutId = shortcutId,
          personName = conversationTitle ?: senderName,
          personIcon = avatarIcon,
          conversationId = conversationId
        )

        if (!canPostNotifications(context)) {
          promise.resolve(false)
          return@Thread
        }

        val senderPerson = Person.Builder()
          .setName(senderName)
          .setKey(senderId)
          .setUri("chatappandroid://user/${encode(senderId)}")
          .setImportant(true)
          .apply { avatarIcon?.let { setIcon(it) } }
          .build()

        val currentUser = Person.Builder()
          .setName("You")
          .setKey("current-user")
          .build()

        val style = NotificationCompat.MessagingStyle(currentUser)
          .setGroupConversation(isGroupConversation)
          .addMessage(body.ifEmpty { title }, timestamp, senderPerson)

        if (isGroupConversation && !conversationTitle.isNullOrEmpty()) {
          style.setConversationTitle(conversationTitle)
        }

        val contentIntent = PendingIntent.getActivity(
          context,
          notificationId,
          conversationIntent(context, conversationId),
          PendingIntent.FLAG_UPDATE_CURRENT or immutablePendingIntentFlag()
        )

        val notification = NotificationCompat.Builder(context, channelId)
          .setSmallIcon(context.applicationInfo.icon)
          .setContentTitle(title)
          .setContentText(body)
          .setCategory(NotificationCompat.CATEGORY_MESSAGE)
          .setPriority(NotificationCompat.PRIORITY_HIGH)
          .setDefaults(NotificationCompat.DEFAULT_ALL)
          .setColor(DEFAULT_COLOR)
          .setShowWhen(true)
          .setWhen(timestamp)
          .setAutoCancel(true)
          .setContentIntent(contentIntent)
          .setStyle(style)
          .setShortcutId(shortcutId)
          .setLocusId(LocusIdCompat(shortcutId))
          .apply { avatarBitmap?.let { setLargeIcon(it) } }
          .build()

        NotificationManagerCompat.from(context).notify(notificationId, notification)
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("CONVERSATION_NOTIFICATION_ERROR", e.message, e)
      }
    }.start()
  }

  @ReactMethod
  fun cancelConversationNotification(conversationId: String, promise: Promise) {
    try {
      val shortcutId = "conversation_$conversationId"
      NotificationManagerCompat
        .from(reactApplicationContext)
        .cancel(notificationIdFor(shortcutId))
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("CANCEL_CONVERSATION_NOTIFICATION_ERROR", e.message, e)
    }
  }

  private fun publishConversationShortcut(
    context: Context,
    shortcutId: String,
    personName: String,
    personIcon: IconCompat?,
    conversationId: String
  ) {
    val encodedConversationId = encode(conversationId)
    val personUri = "chatappandroid://conversation/$encodedConversationId"
    val personBuilder = Person.Builder()
      .setName(personName)
      .setKey(shortcutId)
      .setUri(personUri)
      .setImportant(true)
      .apply { personIcon?.let { setIcon(it) } }

    val shortcutBuilder = ShortcutInfoCompat.Builder(context, shortcutId)
      .setLocusId(LocusIdCompat(shortcutId))
      .setActivity(ComponentName(context, MainActivity::class.java))
      .setShortLabel(personName)
      .setLongLabel(personName)
      .setPerson(personBuilder.build())
      .setLongLived(true)
      .setIsConversation()
      .setIntent(conversationIntent(context, conversationId))

    personIcon?.let { shortcutBuilder.setIcon(it) }

    ShortcutManagerCompat.pushDynamicShortcut(context, shortcutBuilder.build())
  }

  private fun conversationIntent(context: Context, conversationId: String): Intent {
    val encodedConversationId = encode(conversationId)

    return Intent(Intent.ACTION_VIEW).apply {
      setPackage(context.packageName)
      data = Uri.parse("chatappandroid://chatId?chatId=$encodedConversationId")
      putExtra("conversationId", conversationId)
      addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
  }

  private fun ensureMessagesChannel(context: Context, channelId: String) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val notificationManager = context.getSystemService(NotificationManager::class.java)
    if (notificationManager.getNotificationChannel(channelId) != null) return

    val channel = NotificationChannel(
      channelId,
      CHANNEL_NAME,
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = CHANNEL_DESCRIPTION
      enableVibration(true)
      setShowBadge(true)
    }

    notificationManager.createNotificationChannel(channel)
  }

  private fun canPostNotifications(context: Context): Boolean {
    if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
      return false
    }

    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      return true
    }

    return ContextCompat.checkSelfPermission(
      context,
      Manifest.permission.POST_NOTIFICATIONS
    ) == PackageManager.PERMISSION_GRANTED
  }

  private fun loadAvatarIcon(url: String?): IconCompat? {
    return loadAvatarBitmap(url)?.let { IconCompat.createWithAdaptiveBitmap(it) }
  }

  private fun loadAvatarBitmap(url: String?): Bitmap? {
    if (url.isNullOrBlank()) return null

    return try {
      val connection = URL(url).openConnection().apply {
        connectTimeout = AVATAR_TIMEOUT_MS
        readTimeout = AVATAR_TIMEOUT_MS
      }
      connection.getInputStream().use { stream ->
        BitmapFactory.decodeStream(stream)
      }
    } catch (_: Exception) {
      null
    }
  }

  private fun createInitialsBitmap(name: String, userId: String): Bitmap {
    val size = 256
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = android.graphics.Canvas(bitmap)

    val isDarkMode = isDarkTheme()
    val hue = getHue(userId)

    // Mirror your TS logic exactly
    val bgSaturation = if (isDarkMode) 35f else 45f
    val bgLightness  = if (isDarkMode) 12f else 85f
    val fgSaturation = if (isDarkMode) 75f else 70f
    val fgLightness  = if (isDarkMode) 70f else 35f

    val bgColor = hslToColor(hue, bgSaturation, bgLightness)
    val fgColor = hslToColor(hue, fgSaturation, fgLightness)

    val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG)

    // Background circle
    paint.color = bgColor
    paint.style = android.graphics.Paint.Style.FILL
    canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint)

    // First letter
    val initial = name.trim().firstOrNull()?.uppercaseChar()?.toString() ?: "?"

    paint.color = fgColor
    paint.textSize = size * 0.42f
    paint.textAlign = android.graphics.Paint.Align.CENTER
    paint.typeface = android.graphics.Typeface.create(
        android.graphics.Typeface.DEFAULT,
        android.graphics.Typeface.BOLD
    )

    val textBounds = android.graphics.Rect()
    paint.getTextBounds(initial, 0, initial.length, textBounds)
    val textY = size / 2f + textBounds.height() / 2f - textBounds.bottom

    canvas.drawText(initial, size / 2f, textY, paint)

    return bitmap
}

// Same djb2-style hash as your TS version
private fun getHue(userId: String): Float {
    var hash = 0
    for (ch in userId) {
        hash = (hash shl 5) - hash + ch.code
        hash = hash or 0 // keep 32-bit signed — matches `hash |= 0` in JS
    }
    return (hash.absoluteValue % 360).toFloat()
}

// HSL → ARGB  (s and l are 0-100)
private fun hslToColor(h: Float, s: Float, l: Float): Int {
    val s1 = s / 100f
    val l1 = l / 100f
    val c  = (1f - kotlin.math.abs(2f * l1 - 1f)) * s1
    val x  = c * (1f - kotlin.math.abs((h / 60f) % 2f - 1f))
    val m  = l1 - c / 2f

    val (r1, g1, b1) = when {
        h < 60f  -> Triple(c, x, 0f)
        h < 120f -> Triple(x, c, 0f)
        h < 180f -> Triple(0f, c, x)
        h < 240f -> Triple(0f, x, c)
        h < 300f -> Triple(x, 0f, c)
        else     -> Triple(c, 0f, x)
    }

    val r = ((r1 + m) * 255f + 0.5f).toInt().coerceIn(0, 255)
    val g = ((g1 + m) * 255f + 0.5f).toInt().coerceIn(0, 255)
    val b = ((b1 + m) * 255f + 0.5f).toInt().coerceIn(0, 255)

    return android.graphics.Color.argb(255, r, g, b)
}

private fun isDarkTheme(): Boolean {
    val uiModeManager = reactApplicationContext
        .getSystemService(Context.UI_MODE_SERVICE) as android.app.UiModeManager
    return uiModeManager.nightMode == android.app.UiModeManager.MODE_NIGHT_YES
}

  private fun optionalString(options: ReadableMap, key: String): String? {
    if (!options.hasKey(key) || options.isNull(key)) return null
    return options.getString(key)?.takeIf { it.isNotBlank() }
  }

  private fun optionalBoolean(options: ReadableMap, key: String): Boolean? {
    if (!options.hasKey(key) || options.isNull(key)) return null
    return options.getBoolean(key)
  }

  private fun optionalDouble(options: ReadableMap, key: String): Double? {
    if (!options.hasKey(key) || options.isNull(key)) return null
    return options.getDouble(key)
  }

  private fun requireString(options: ReadableMap, key: String): String {
    return optionalString(options, key)
      ?: throw IllegalArgumentException("$key is required")
  }

  private fun encode(value: String): String {
    return URLEncoder.encode(value, StandardCharsets.UTF_8.toString())
  }

  private fun notificationIdFor(key: String): Int {
    val hash = key.hashCode()
    return if (hash == Int.MIN_VALUE) 0 else hash.absoluteValue
  }

  private fun immutablePendingIntentFlag(): Int {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      PendingIntent.FLAG_IMMUTABLE
    } else {
      0
    }
  }

  private companion object {
    const val DEFAULT_CHANNEL_ID = "messages"
    const val CHANNEL_NAME = "Messages"
    const val CHANNEL_DESCRIPTION = "Chat message notifications"
    const val DEFAULT_TITLE = "New message"
    const val AVATAR_TIMEOUT_MS = 3000
    val DEFAULT_COLOR = 0xFF25D366.toInt()
  }
}
