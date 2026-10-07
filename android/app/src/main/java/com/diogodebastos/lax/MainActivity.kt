package com.diogodebastos.lax

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.ActivityOptions
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Color
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.hardware.display.DisplayManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import android.view.Display
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject

/** Lax's body: the same page as the browser, full screen, with native voice through [LaxBridge]. */
class MainActivity : Activity() {
    companion object {
        const val REQ_MIC = 1
        const val REQ_FIRST_RUN = 2
        /** LaxService skips notifications for what the page is already showing. */
        @Volatile var resumed = false
        /** The screen Lax was last in front on, and when it left: LaxService moves it along when you fold or unfold. */
        @Volatile var front = -1
        @Volatile private var leftAt = 0L
        // Folding pauses Lax a split second before the hinge reads closed, so "just left" counts; a second, no more,
        // or Lax would follow you out of another app you'd just switched to.
        fun wasOn(display: Int) = front == display && (resumed || System.currentTimeMillis() - leftAt < 1000)
        /** Where Lax was just moved, and when: covered there right after (the cover's clock), it comes back at once. */
        @Volatile private var movedTo = -1
        @Volatile private var movedAt = 0L
    }

    private lateinit var web: WebView
    private lateinit var bridge: LaxBridge
    private val main = Handler(Looper.getMainLooper())

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val cfg = Lax.config(this)
        if (cfg == null) {
            startActivity(Intent(this, PairActivity::class.java)); finish(); return
        }
        displayId = display?.displayId ?: -1
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setShowWhenLocked(true)
        setTurnScreenOn(true)

        web = WebView(this).apply { setBackgroundColor(Color.BLACK) }
        setContentView(web)
        // Edge to edge, under the camera hole too: the page then covers the whole screen, so its 50% is the hinge.
        window.setDecorFitsSystemWindows(false)
        window.attributes = window.attributes.apply {
            layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
        }
        web.setOnApplyWindowInsetsListener { v, insets ->
            // The page keeps its top bar clear of the camera hole (LaxNative.insets()).
            val c = insets.displayCutout
            val d = resources.displayMetrics.density
            cutout = JSONObject().apply {
                if (c != null) put("top", c.safeInsetTop / d).put("left", c.safeInsetLeft / d)
                    .put("right", c.safeInsetRight / d).put("bottom", c.safeInsetBottom / d)
            }.toString()
            v.onApplyWindowInsets(insets)
        }
        immersive()
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            userAgentString = "$userAgentString LaxApp/0.2"
        }
        CookieManager.getInstance().setAcceptCookie(true)
        bridge = LaxBridge(this, web)
        web.addJavascriptInterface(bridge, "LaxNative")
        web.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                Log.i("LaxPage", "${m.message()} (${m.sourceId()}:${m.lineNumber()})"); return true
            }
        }
        web.webViewClient = object : WebViewClient() {
            // The Mac is asleep or off (Cloudflare answers 502/530), or there's no network: show Lax asleep.
            override fun onReceivedError(view: WebView, req: WebResourceRequest, err: WebResourceError) {
                if (req.isForMainFrame) sleep()
            }
            override fun onReceivedHttpError(view: WebView, req: WebResourceRequest, res: WebResourceResponse) {
                if (req.isForMainFrame && res.statusCode >= 500) sleep()
            }
        }
        load()
        LaxService.start(this)
        firstRun()
        getSystemService(SensorManager::class.java).run { getDefaultSensor(Sensor.TYPE_HINGE_ANGLE)?.let { registerListener(hinge, it, SensorManager.SENSOR_DELAY_NORMAL, main) } }
    }

    // Continuity: Lax follows you between the screens. Fold the phone while Lax is open → it moves to the cover;
    // unfold while it's on the cover → back to the main screen. Lax not in front: nothing happens. The hinge says
    // folded or open (the screens' on/off states can't tell a fold from the power button). Watched here, by the screen
    // you're looking at: a background service doesn't get the hinge's readings.
    private var folded: Boolean? = null
    private val hinge = object : SensorEventListener {
        override fun onAccuracyChanged(s: Sensor?, a: Int) {}
        override fun onSensorChanged(e: SensorEvent) {
            val angle = e.values[0]
            val now = when { angle < 15 -> true; angle > 60 -> false; else -> return } // in between: no change
            if (now == folded) return
            val was = folded; folded = now
            Log.w("Lax", "hinge ${angle.toInt()}°: ${if (now) "folded" else "open"}, lax on $front (in front: $resumed)")
            if (was == null) return // the first reading only tells where we start
            // Apps don't see the cover in DisplayManager's list (it's "own content only"); on the Flip it's display 1.
            val cover = getSystemService(DisplayManager::class.java).displays.firstOrNull { it.displayId != Display.DEFAULT_DISPLAY }?.displayId ?: 1
            if (now && wasOn(Display.DEFAULT_DISPLAY)) moveTo(cover)
            else if (!now && wasOn(cover)) moveTo(Display.DEFAULT_DISPLAY)
        }
    }
    // Folded, One UI opens its own cover home (the clock) half a second later, on top of Lax: so Lax looks again a
    // moment later and comes back in front if it was covered (allowed by "display over other apps").
    private fun moveTo(displayId: Int) {
        val app = applicationContext // this activity is rebuilt on its new screen; the app outlives it
        val open = {
            try {
                app.startActivity(Intent(app, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                    ActivityOptions.makeBasic().setLaunchDisplayId(displayId).toBundle())
            } catch (e: Exception) { Log.w("Lax", "move to display $displayId: $e") }
        }
        Log.w("Lax", "following you to display $displayId"); movedTo = displayId; movedAt = System.currentTimeMillis(); open()
        main.postDelayed({ if (!(resumed && front == displayId)) { Log.w("Lax", "covered on display $displayId: back in front"); open() } }, 1500)
    }

    @Volatile private var asleep = false
    /** Camera-hole insets in CSS px, as JSON, for the page. */
    @Volatile var cutout = "{}"

    /** The offline copy of the page, with Lax asleep. Polls the Mac and loads the real page once it answers. */
    private fun sleep() {
        if (asleep) return
        asleep = true
        web.loadUrl("file:///android_asset/index.html?asleep")
        Thread({
            while (asleep && !isDestroyed) {
                Thread.sleep(10_000)
                val cfg = Lax.config(this) ?: break
                val up = try {
                    val c = Lax.open(cfg, "/api/memory"); c.connectTimeout = 8000; c.readTimeout = 8000
                    (c.responseCode == 200).also { c.disconnect() }
                } catch (_: Exception) { false }
                if (up) main.post { asleep = false; load() }
            }
        }, "lax-wake").start()
    }

    /** Service-token headers let the first load through Cloudflare Access; the browser login (email PIN) also works and its cookie persists. */
    private fun load() = Lax.config(this)?.let { web.loadUrl(it.url, it.headers()) }

    private fun immersive() {
        window.insetsController?.apply {
            hide(WindowInsets.Type.systemBars())
            systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    private fun firstRun() {
        val want = listOf(Manifest.permission.RECORD_AUDIO, Manifest.permission.POST_NOTIFICATIONS)
            .filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (want.isNotEmpty()) requestPermissions(want.toTypedArray(), REQ_FIRST_RUN) else askBattery()
    }

    /** One UI kills background links unless Lax is exempt from battery optimisation. Asked once. */
    @SuppressLint("BatteryLife")
    private fun askBattery() {
        if (getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(packageName) || Lax.flag(this, "askedBattery")) return askOverlay()
        Lax.setFlag(this, "askedBattery")
        startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
    }

    /** "Display over other apps": what lets Lax open itself on the cover screen when you fold the phone. Asked once. */
    private fun askOverlay() {
        if (Settings.canDrawOverlays(this) || Lax.flag(this, "askedOverlay")) return
        Lax.setFlag(this, "askedOverlay")
        startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
    }

    override fun onRequestPermissionsResult(code: Int, perms: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(code, perms, results)
        if (code == REQ_FIRST_RUN) askBattery()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        if (!::web.isInitialized) return
        resumed = true; front = display?.displayId ?: -1
        web.onResume()
        immersive()
        LaxService.start(this)
    }

    override fun onPause() {
        resumed = false; leftAt = System.currentTimeMillis()
        if (front == movedTo && leftAt - movedAt < 3000 && !isFinishing && !isChangingConfigurations) { // the cover's clock just covered Lax
            movedAt = 0; Log.w("Lax", "covered right after moving: back in front")
            startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                ActivityOptions.makeBasic().setLaunchDisplayId(front).toBundle())
        }
        if (::web.isInitialized) {
            web.onPause()
            CookieManager.getInstance().flush()
        }
        super.onPause()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus && ::web.isInitialized) immersive()
    }

    // Fold ↔ unfold and the cover screen: handled here (see configChanges), so the page just gets a resize event.
    // Except a move to the other screen (main ↔ cover, density 480 ↔ 160): the WebView stays black there, so the
    // activity is rebuilt on its new screen. The link to the Mac lives in LaxService and isn't touched.
    private var displayId = -1
    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        val now = display?.displayId ?: -1
        if (displayId != -1 && now != displayId) { displayId = now; recreate(); return }
        displayId = now
        if (::web.isInitialized) {
            immersive()
            web.evaluateJavascript("window.laxOnTheme && laxOnTheme()", null) // dark mode may have changed
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (::web.isInitialized && web.canGoBack()) web.goBack() else moveTaskToBack(true)
    }

    override fun onDestroy() {
        resumed = false
        getSystemService(SensorManager::class.java).unregisterListener(hinge)
        if (::web.isInitialized) {
            bridge.shutdown()
            web.destroy()
        }
        super.onDestroy()
    }
}
