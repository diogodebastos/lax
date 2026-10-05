package com.diogodebastos.lax

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

/** Lax's body: the same page as the browser, full screen, with native voice through [LaxBridge]. */
class MainActivity : Activity() {
    companion object {
        const val REQ_MIC = 1
        const val REQ_FIRST_RUN = 2
        /** LaxService skips notifications for what the page is already showing. */
        @Volatile var resumed = false
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
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setShowWhenLocked(true)
        setTurnScreenOn(true)

        web = WebView(this).apply { setBackgroundColor(Color.BLACK) }
        setContentView(web)
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
            override fun onReceivedError(view: WebView, req: WebResourceRequest, err: WebResourceError) {
                // Offline at launch (or the Mac asleep): keep retrying instead of leaving an error page up.
                if (req.isForMainFrame) main.postDelayed({ load() }, 5000)
            }
        }
        load()
        LaxService.start(this)
        firstRun()
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
        if (getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(packageName) || Lax.flag(this, "askedBattery")) return
        Lax.setFlag(this, "askedBattery")
        startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
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
        resumed = true
        web.onResume()
        immersive()
        LaxService.start(this)
    }

    override fun onPause() {
        resumed = false
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
    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        if (::web.isInitialized) immersive()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (::web.isInitialized && web.canGoBack()) web.goBack() else moveTaskToBack(true)
    }

    override fun onDestroy() {
        resumed = false
        if (::web.isInitialized) {
            bridge.shutdown()
            web.destroy()
        }
        super.onDestroy()
    }
}
