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

    /** Where it links now: the paired address, or the other way in while that one is broken (see [move]). */
    fun config(ctx: Context): Config? {
        val c = paired(ctx) ?: return null
        val way = prefs(ctx).getString("active", null)?.let { ways(ctx)?.optJSONObject(it)?.optString("url") }
        return if (way.isNullOrBlank()) c else c.copy(url = way.trimEnd('/') + "/?t=" + Uri.encode(c.token))
    }

    /** The address you paired with: the way in you chose. */
    fun paired(ctx: Context): Config? {
        val p = prefs(ctx)
        val url = p.getString("url", null) ?: return null
        return Config(url, p.getString("cfId", "") ?: "", p.getString("cfSecret", "") ?: "")
    }

    fun save(ctx: Context, c: Config) {
        prefs(ctx).edit().putString("url", c.url).putString("cfId", c.cfId).putString("cfSecret", c.cfSecret).remove("active").apply()
    }

    // The ways in (lib/ways.mjs on the Mac): { tunnel: { url, up }, relay: { url, up }, prefer }, as the Mac last said.
    fun ways(ctx: Context): JSONObject? = try { prefs(ctx).getString("ways", null)?.let(::JSONObject) } catch (_: Exception) { null }
    fun saveWays(ctx: Context, w: JSONObject) = prefs(ctx).edit().putString("ways", w.toString()).apply()
    /** Which way a config links through ("tunnel", "relay"), or null if the Mac never said. */
    fun wayOf(ctx: Context, c: Config): String? {
        val w = ways(ctx) ?: return null
        return listOf("tunnel", "relay").firstOrNull { k -> w.optJSONObject(k)?.optString("url")?.let { Uri.parse(it).encodedAuthority == Uri.parse(c.url).encodedAuthority } == true }
    }
    /** Link through the other way (null: back to the paired one). Never twice within 3 minutes, so a bad minute can't bounce it. */
    fun move(ctx: Context, way: String?): Boolean {
        val p = prefs(ctx)
        if (System.currentTimeMillis() - p.getLong("movedAt", 0) < 3 * 60_000) return false
        p.edit().apply { if (way == null) remove("active") else putString("active", way) }.putLong("movedAt", System.currentTimeMillis()).apply()
        return true
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
