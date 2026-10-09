package com.diogodebastos.lax

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/**
 * `window.LaxNative` for the page: Android's own speech recognition and TTS (no browser quirks), and vibration.
 * Results come back as calls to the page's globals: laxOnSpeech(text, final, guesses), laxOnSpeechError(code), laxOnSpeaking(on).
 */
class LaxBridge(private val act: MainActivity, private val web: WebView) {
    private val main = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var lang = "en-US"
    private var ttsReady = false
    private val tts = TextToSpeech(act) { status ->
        ttsReady = status == TextToSpeech.SUCCESS
        if (ttsReady) pickVoice()
    }

    init {
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(id: String?) = js("laxOnSpeaking", "true")
            override fun onDone(id: String?) = js("laxOnSpeaking", "false")
            @Deprecated("Deprecated in Java") override fun onError(id: String?) = js("laxOnSpeaking", "false")
            override fun onStop(id: String?, interrupted: Boolean) = js("laxOnSpeaking", "false")
        })
    }

    private fun js(fn: String, vararg args: String) {
        main.post { web.evaluateJavascript("window.$fn && $fn(${args.joinToString(",")})", null) }
    }

    @JavascriptInterface fun isNative() = true

    /** The camera hole's safe insets in CSS px: {"top":31.3,…}. */
    @JavascriptInterface fun insets(): String = act.cutout

    /** The phone's dark mode, for the page's "system" theme. */
    @JavascriptInterface fun nightMode(): Boolean =
        (act.resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES

    // ---------- speech recognition ----------
    private var retried = false

    /** Names to listen for (Lax's vocabulary, a JSON array): the recognizer leans towards them (Android 13+). */
    private var bias = arrayListOf<String>()

    @JavascriptInterface fun listen(language: String?) = listenFor(language, null)

    @JavascriptInterface fun listenFor(language: String?, words: String?) = main.post {
        retried = false
        bias = try { JSONArray(words ?: "[]").let { a -> ArrayList((0 until a.length()).map { a.getString(it) }.take(100)) } } catch (_: Exception) { arrayListOf() }
        lang = language?.takeIf { it.isNotBlank() } ?: "en-US"
        if (act.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            act.requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), MainActivity.REQ_MIC)
            js("laxOnSpeechError", "'not-allowed'")
            return@post
        }
        if (!SpeechRecognizer.isRecognitionAvailable(act)) { js("laxOnSpeechError", "'service-not-allowed'"); return@post }
        start(preferOffline = true)
    }

    /** Bumped per listening session; callbacks from an earlier one are ignored. */
    private var session = 0

    private fun start(preferOffline: Boolean) {
        // One recognizer, reused. Destroying it per tap made the old one report "service disconnected"
        // (error 11) into the session that had just started, so every other tap failed at once.
        val r = recognizer ?: SpeechRecognizer.createSpeechRecognizer(act).also { recognizer = it }
        r.cancel()
        r.apply {
            setRecognitionListener(Listener(++session, preferOffline))
            startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5) // several guesses: the page keeps the one with a name it knows
                if (android.os.Build.VERSION.SDK_INT >= 33 && bias.isNotEmpty())
                    putStringArrayListExtra(RecognizerIntent.EXTRA_BIASING_STRINGS, bias)
                putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, preferOffline)
                // Punctuation (a question gets its "?"), where the recognizer can do it; the page adds a "?" otherwise.
                if (android.os.Build.VERSION.SDK_INT >= 33)
                    putExtra(RecognizerIntent.EXTRA_ENABLE_FORMATTING, RecognizerIntent.FORMATTING_OPTIMIZE_QUALITY)
            })
        }
    }

    /** Finish now and deliver what was heard. */
    @JavascriptInterface fun stopListening() = main.post { recognizer?.stopListening() }

    /** Drop it: nothing is sent. */
    @JavascriptInterface fun cancelListening() = main.post {
        session++ // whatever the old session still reports is ignored
        recognizer?.cancel()
        js("laxOnSpeechError", "'aborted'")
    }

    private inner class Listener(private val id: Int, private val preferOffline: Boolean) : RecognitionListener {
        private val current get() = id == session
        private fun guesses(b: Bundle?) = b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.filter { it.isNotBlank() } ?: emptyList()
        private fun send(g: List<String>, final: Boolean) = js("laxOnSpeech", JSONObject.quote(g[0]), final.toString(), JSONArray(g).toString())
        override fun onPartialResults(b: Bundle?) { val g = guesses(b); if (current && g.isNotEmpty()) send(g, false) }
        override fun onResults(b: Bundle?) {
            if (!current) return
            val g = guesses(b)
            if (g.isEmpty()) js("laxOnSpeechError", "'no-speech'") else send(g, true)
        }
        override fun onError(error: Int) {
            if (!current) return
            // The speech service dropped its connection (it restarts itself): start over once with a fresh recognizer.
            if (error == SpeechRecognizer.ERROR_SERVER_DISCONNECTED && !retried) {
                retried = true
                main.post { recognizer?.destroy(); recognizer = null; start(preferOffline) }; return
            }
            // No offline language pack: try again online before giving up.
            if (preferOffline && (error == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE || error == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED)) {
                main.post { start(preferOffline = false) }; return
            }
            val code = when (error) {
                SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "no-speech"
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "not-allowed"
                SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT,
                SpeechRecognizer.ERROR_SERVER, SpeechRecognizer.ERROR_SERVER_DISCONNECTED -> "network"
                SpeechRecognizer.ERROR_AUDIO -> "audio-capture"
                SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "busy"
                SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE, SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED -> "language-not-supported"
                SpeechRecognizer.ERROR_CLIENT -> "aborted"
                else -> "error-$error"
            }
            Log.i("LaxBridge", "speech error $error → $code")
            js("laxOnSpeechError", JSONObject.quote(code))
        }
        override fun onReadyForSpeech(p: Bundle?) {}
        // You started (or went on) talking: the page holds off sending after a pause (laxOnSpeechBegin).
        override fun onBeginningOfSpeech() { if (current) js("laxOnSpeechBegin") }
        override fun onRmsChanged(rms: Float) {}
        override fun onBufferReceived(buf: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onEvent(type: Int, p: Bundle?) {}
    }

    // ---------- text-to-speech ----------
    /** The language Lax speaks in (its language setting, "pt-PT"): a voice on the phone, the country's if there is one. */
    private var voiceLang = "en-US"
    private fun pickVoice() {
        val want = Locale.forLanguageTag(voiceLang)
        val same = tts.voices?.filter { it.locale.language == want.language && !it.isNetworkConnectionRequired }
        val v = same?.firstOrNull { it.locale.country == want.country } ?: same?.firstOrNull()
        if (v != null) tts.voice = v else tts.language = want
    }

    @JavascriptInterface fun speak(text: String?, pitch: Double) = speakIn(text, pitch, null)

    @JavascriptInterface fun speakIn(text: String?, pitch: Double, language: String?) = main.post {
        if (!ttsReady || text.isNullOrBlank()) return@post
        val l = language?.takeIf { it.isNotBlank() } ?: "en-US"
        if (l != voiceLang) { voiceLang = l; pickVoice() }
        tts.setPitch(pitch.toFloat().coerceIn(0.5f, 2f))
        tts.setSpeechRate(1.08f)
        tts.speak(text.replace(Regex("[`*_#]"), ""), TextToSpeech.QUEUE_FLUSH, null, "lax")
    }

    @JavascriptInterface fun hush() = main.post { tts.stop(); js("laxOnSpeaking", "false") }

    // ---------- vibration ----------
    /** pattern: "80,60,80" (on, off, on… in ms), like navigator.vibrate. */
    @JavascriptInterface fun vibrate(pattern: String?) {
        val ms = pattern?.split(',')?.mapNotNull { it.trim().toLongOrNull()?.coerceIn(0, 2000) }?.take(20) ?: return
        if (ms.isEmpty()) return
        val v = if (Build.VERSION.SDK_INT >= 31) act.getSystemService(VibratorManager::class.java).defaultVibrator
                else @Suppress("DEPRECATION") act.getSystemService(Vibrator::class.java)
        v.vibrate(VibrationEffect.createWaveform(longArrayOf(0) + ms.toLongArray(), -1))
    }

    // ---------- memory for the offline page ----------
    /** How Lax looks (pet + settings JSON), so the asleep page can draw the same Lax when the Mac is unreachable. */
    @JavascriptInterface fun remember(json: String?) {
        if (json != null && json.length < 20_000) act.getSharedPreferences("lax", 0).edit().putString("look", json).apply()
    }
    @JavascriptInterface fun recall(): String = act.getSharedPreferences("lax", 0).getString("look", null) ?: ""

    fun shutdown() {
        recognizer?.destroy()
        tts.shutdown()
    }
}
