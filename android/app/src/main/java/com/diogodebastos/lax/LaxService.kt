package com.diogodebastos.lax

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.display.DisplayManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.Uri
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import android.view.Display
import org.json.JSONObject
import java.net.HttpURLConnection

/**
 * The background link to the Mac: an SSE client on /api/stream that survives the phone sleeping.
 * Permission prompts become Approve / Deny notifications that buzz, wake the screen and show on the cover screen.
 */
class LaxService : Service() {
    companion object {
        private const val TAG = "LaxService"
        const val CH_LINK = "link"
        const val CH_ASK = "ask"
        const val CH_NEWS = "news"
        private const val ID_LINK = 1
        const val ACTION_RELINK = "com.diogodebastos.lax.RELINK"

        fun start(ctx: Context, relink: Boolean = false) {
            if (Lax.config(ctx) == null) return
            val i = Intent(ctx, LaxService::class.java)
            if (relink) i.action = ACTION_RELINK
            ctx.startForegroundService(i)
        }

        /** Stable notification id per Lax bubble id, so `clear` can cancel it. */
        fun notifId(bubbleId: String) = 1000 + (bubbleId.hashCode() and 0x7fffffff) % 1_000_000

        fun channels(ctx: Context) {
            val nm = ctx.getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(NotificationChannel(CH_LINK, "Link to your Mac", NotificationManager.IMPORTANCE_MIN).apply {
                description = "Lax keeps watching your Claude Code sessions."
                setShowBadge(false)
            })
            nm.createNotificationChannel(NotificationChannel(CH_ASK, "Claude Code needs you", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Approve or deny tool use, answer questions."
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 120, 80, 120, 80, 240)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            })
            nm.createNotificationChannel(NotificationChannel(CH_NEWS, "Done and level-ups", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Finished turns, replies and Lax growing up."
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            })
        }
    }

    @Volatile private var running = false
    @Volatile private var conn: HttpURLConnection? = null
    @Volatile private var linkedAt = 0L
    private var worker: Thread? = null
    private val lock = Object()
    private val main = Handler(Looper.getMainLooper())
    private val nm by lazy { getSystemService(NotificationManager::class.java) }
    /** Asks we've shown. After a reconnect, the server resends the ones still pending; the rest are stale. */
    private val shownAsks = mutableSetOf<String>()
    private val resent = mutableSetOf<String>() // main thread only, like shownAsks

    private val netCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            // Back online (or switched Wi-Fi ↔ mobile): don't wait for the backoff or a dead socket's read timeout.
            if (System.currentTimeMillis() - linkedAt > 5000) kick()
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        channels(this)
        startForeground(ID_LINK, linkNotification("connecting…"), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        getSystemService(ConnectivityManager::class.java).registerDefaultNetworkCallback(netCallback)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (Lax.config(this) == null) { stopSelf(); return START_NOT_STICKY }
        if (worker?.isAlive != true) {
            running = true
            worker = Thread(::loop, "lax-link").also { it.start() }
        } else if (intent?.action == ACTION_RELINK) kick()
        return START_STICKY
    }

    override fun onDestroy() {
        running = false
        try { getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(netCallback) } catch (_: Exception) {}
        kick()
        super.onDestroy()
    }

    /** Drop the current connection (if any) and retry right away. */
    private fun kick() {
        conn?.disconnect()
        synchronized(lock) { lock.notifyAll() }
    }

    private fun loop() {
        var backoff = 1000L
        while (running) {
            val cfg = Lax.config(this) ?: break
            // stream() returns why it couldn't link (shown as is), or null when the link dropped.
            val why = try {
                stream(cfg) { backoff = 1000L }
            } catch (e: Exception) {
                Log.i(TAG, "link: ${e.javaClass.simpleName}: ${e.message}"); null
            }
            conn = null
            linkedAt = 0
            if (!running) break
            setLink(why ?: "reconnecting…")
            synchronized(lock) { lock.wait(backoff) }
            backoff = (backoff * 2).coerceAtMost(30_000L)
        }
    }

    private fun stream(cfg: Lax.Config, onOpen: () -> Unit): String? {
        val c = Lax.open(cfg, "/api/stream?t=" + Uri.encode(cfg.token))
        c.connectTimeout = 15_000
        c.readTimeout = 60_000 // the server pings every 20s
        c.setRequestProperty("accept", "text/event-stream")
        conn = c
        val code = c.responseCode
        val type = c.contentType ?: ""
        if (code != 200 || !type.startsWith("text/event-stream")) {
            // Usually Cloudflare Access turning us away (no or wrong service token), or a bad Lax token.
            c.disconnect()
            return when {
                code == 401 -> "bad Lax token, pair again"
                code in 500..599 -> "$name is asleep, waiting…" // Cloudflare: tunnel or server down (502 / 530)
                else -> "can't link ($code ${type.substringBefore(';')})"
            }
        }
        linkedAt = System.currentTimeMillis()
        onOpen()
        setLink("linked to ${cfg.host}")
        main.post {
            // The server resends every pending ask right after connecting; anything not resent was settled meanwhile.
            val stale = shownAsks.toSet()
            resent.clear()
            main.postDelayed({ for (id in stale) if (id !in resent) cancelAsk(id) }, 3000)
        }
        c.inputStream.bufferedReader().use { r ->
            var event = "message"
            val data = StringBuilder()
            while (running) {
                val line = r.readLine() ?: break
                when {
                    line.isEmpty() -> {
                        if (data.isNotEmpty()) dispatch(event, data.toString())
                        event = "message"; data.setLength(0)
                    }
                    line.startsWith(":") -> {}
                    line.startsWith("event:") -> event = line.substring(6).trim()
                    line.startsWith("data:") -> { if (data.isNotEmpty()) data.append('\n'); data.append(line.substring(5).trimStart()) }
                }
            }
        }
        return null
    }

    private fun dispatch(event: String, data: String) {
        val j = try { JSONObject(data) } catch (_: Exception) { return }
        main.post {
            when (event) {
                "bubble" -> onBubble(j)
                "state" -> j.optJSONObject("settings")?.optString("name")?.takeIf { it.isNotBlank() }?.let(::rename)
                "clear" -> cancelAsk(j.optString("id"))
            }
        }
    }

    private fun onBubble(b: JSONObject) {
        val id = b.optString("id")
        val kind = b.optString("kind")
        val text = b.optString("text")
        when {
            kind == "permission" && b.optBoolean("actions") -> { resent.add(id); ask(id, "needs you", text, b.optString("details"), true) }
            kind == "question" -> {
                resent.add(id)
                val q = b.optJSONArray("questions")?.optJSONObject(0)
                ask(id, "question · ${b.optString("project")}", q?.optString("question") ?: text, "", false)
            }
            // The page already shows these while it's in front.
            kind in setOf("done", "levelup", "reply") && !MainActivity.resumed -> news(kind, b.optString("say").ifEmpty { text })
        }
    }

    private fun openApp(): PendingIntent = PendingIntent.getActivity(this, 0,
        Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    private fun decision(id: String, decision: String): PendingIntent {
        val i = Intent(this, DecisionReceiver::class.java).putExtra("id", id).putExtra("decision", decision)
        val code = notifId(id) * 2 + if (decision == "allow") 0 else 1
        return PendingIntent.getBroadcast(this, code, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    private fun ask(id: String, title: String, text: String, details: String, actions: Boolean) {
        val big = if (details.isNotBlank()) "$text\n\n$details" else text
        val n = Notification.Builder(this, CH_ASK)
            .setSmallIcon(R.drawable.ic_stat_lax)
            .setColor(0xFFD97757.toInt())
            .setContentTitle("$name · $title")
            .setContentText(text)
            .setStyle(Notification.BigTextStyle().bigText(big))
            .setCategory(Notification.CATEGORY_REMINDER)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setContentIntent(openApp())
            .setOnlyAlertOnce(true)
            .setAutoCancel(!actions)
            .setTimeoutAfter(15 * 60_000L)
        if (actions) {
            n.addAction(Notification.Action.Builder(null, "Approve", decision(id, "allow")).build())
            n.addAction(Notification.Action.Builder(null, "Deny", decision(id, "deny")).build())
        }
        val fresh = shownAsks.add(id)
        if (MainActivity.resumed) return // Lax is on screen and shows the same bubble.
        nm.notify(notifId(id), n.build())
        if (!fresh) return
        // Phone closed: Lax comes up on the cover with the bubble (glance, don't open). The notification stays as a fallback.
        if (closed() && Settings.canDrawOverlays(this) && MainActivity.openOnCover(this)) return
        wakeScreen()
    }

    /** Folded, by the hinge (MainActivity's last reading); before Lax has read it, by the main screen being off. */
    private fun closed() = MainActivity.folded
        ?: (getSystemService(DisplayManager::class.java).getDisplay(Display.DEFAULT_DISPLAY)?.state != Display.STATE_ON)

    private fun cancelAsk(id: String) {
        shownAsks.remove(id)
        nm.cancel(notifId(id))
    }

    private fun news(kind: String, text: String) {
        val title = when (kind) { "levelup" -> "★ level up"; "reply" -> name; else -> "done" }
        nm.notify(2, Notification.Builder(this, CH_NEWS)
            .setSmallIcon(R.drawable.ic_stat_lax)
            .setColor(0xFFD97757.toInt())
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(Notification.BigTextStyle().bigText(text))
            .setContentIntent(openApp())
            .setAutoCancel(true)
            .build())
    }

    @Suppress("DEPRECATION")
    private fun wakeScreen() {
        // Heads-up alone doesn't light a sleeping screen on One UI; a short bright wake lock does.
        val pm = getSystemService(PowerManager::class.java)
        if (pm.isInteractive) return
        pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP, "lax:ask").acquire(10_000)
    }

    /** The character's name (the user picks it in the life menu); remembered for after a reboot. The app itself stays "Lax". */
    private val name: String get() = Lax.name(this)
    private fun rename(n: String) {
        if (n == Lax.name(this)) return
        Lax.setName(this, n)
        nm.notify(ID_LINK, linkNotification(lastLink.ifEmpty { "linked" }))
    }

    private var lastLink = ""
    private fun setLink(text: String) {
        if (text == lastLink) return
        lastLink = text
        nm.notify(ID_LINK, linkNotification(text))
    }

    private fun linkNotification(text: String): Notification = Notification.Builder(this, CH_LINK)
        .setSmallIcon(R.drawable.ic_stat_lax)
        .setColor(0xFFD97757.toInt())
        .setContentTitle("$name is watching")
        .setContentText(text)
        .setContentIntent(openApp())
        .setOngoing(true)
        .setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
        .build()
}
