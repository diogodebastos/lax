package com.diogodebastos.lax

import android.content.Context
import android.net.Uri
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Pairing config (stored on the phone only) and small HTTP helpers shared by the app and the service. */
object Lax {
    data class Config(val url: String, val cfId: String, val cfSecret: String) {
        private val uri: Uri get() = Uri.parse(url)
        /** e.g. https://lax.example.com */
        val origin: String get() = "${uri.scheme}://${uri.encodedAuthority}"
        val token: String get() = uri.getQueryParameter("t") ?: ""
        val host: String get() = uri.host ?: url

        /** Cloudflare Access service-token headers: the background link has no browser login. */
        fun headers(): Map<String, String> =
            if (cfId.isBlank()) emptyMap()
            else mapOf("CF-Access-Client-Id" to cfId, "CF-Access-Client-Secret" to cfSecret)
    }

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("lax", Context.MODE_PRIVATE)

    fun config(ctx: Context): Config? {
        val p = prefs(ctx)
        val url = p.getString("url", null) ?: return null
        return Config(url, p.getString("cfId", "") ?: "", p.getString("cfSecret", "") ?: "")
    }

    fun save(ctx: Context, c: Config) {
        prefs(ctx).edit().putString("url", c.url).putString("cfId", c.cfId).putString("cfSecret", c.cfSecret).apply()
    }

    fun name(ctx: Context): String = prefs(ctx).getString("name", null) ?: "Lax"
    fun setName(ctx: Context, n: String) = prefs(ctx).edit().putString("name", n.take(12)).apply()

    fun flag(ctx: Context, key: String): Boolean = prefs(ctx).getBoolean(key, false)
    fun setFlag(ctx: Context, key: String) = prefs(ctx).edit().putBoolean(key, true).apply()

    /** Valid pairing URL: http(s) with a token. */
    fun validUrl(url: String): Boolean {
        val u = Uri.parse(url.trim())
        return (u.scheme == "https" || u.scheme == "http") && !u.host.isNullOrEmpty() && !u.getQueryParameter("t").isNullOrEmpty()
    }

    fun open(c: Config, path: String): HttpURLConnection {
        val conn = URL(c.origin + path).openConnection() as HttpURLConnection
        conn.setRequestProperty("x-lax-token", c.token)
        for ((k, v) in c.headers()) conn.setRequestProperty(k, v)
        return conn
    }

    /** POST JSON to the Mac. Blocking; call off the main thread. Returns the HTTP status (or -1). */
    fun post(c: Config, path: String, body: JSONObject): Int = try {
        val conn = open(c, path)
        conn.requestMethod = "POST"
        conn.connectTimeout = 10_000
        conn.readTimeout = 15_000
        conn.doOutput = true
        conn.setRequestProperty("content-type", "application/json")
        conn.outputStream.use { it.write(body.toString().toByteArray()) }
        val code = conn.responseCode
        conn.inputStream.use { it.readBytes() }
        conn.disconnect()
        code
    } catch (e: Exception) {
        -1
    }
}
