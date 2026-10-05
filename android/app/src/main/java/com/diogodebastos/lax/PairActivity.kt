package com.diogodebastos.lax

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * Pairing: scan the app QR on the Mac's localhost:7777/pair (a lax://pair?u=…&id=…&s=… link), or type it in.
 * A link only fills the form; you confirm with one tap, so no web page can silently re-point Lax elsewhere.
 */
class PairActivity : Activity() {
    private lateinit var url: EditText
    private lateinit var cfId: EditText
    private lateinit var cfSecret: EditText
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(form())
        fill(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        fill(intent)
    }

    private fun fill(intent: Intent?) {
        val d = intent?.data
        val cur = Lax.config(this)
        if (d != null && d.scheme == "lax" && d.host == "pair") {
            url.setText(d.getQueryParameter("u") ?: "")
            cfId.setText(d.getQueryParameter("id") ?: "")
            cfSecret.setText(d.getQueryParameter("s") ?: "")
            status.text = "Pair with ${Lax.Config(url.text.toString(), "", "").host}?"
        } else if (cur != null) {
            url.setText(cur.url); cfId.setText(cur.cfId); cfSecret.setText(cur.cfSecret)
            status.text = "Paired with ${cur.host}."
        } else {
            status.text = "On your Mac, open localhost:7777/pair and scan the app QR. Or paste the details here."
        }
    }

    private fun pair() {
        val u = url.text.toString().trim()
        if (!Lax.validUrl(u)) { status.text = "That URL needs to look like https://…/?t=<token>"; return }
        Lax.save(this, Lax.Config(u, cfId.text.toString().trim(), cfSecret.text.toString().trim()))
        LaxService.start(this, relink = true)
        startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
        finish()
    }

    private fun form(): ScrollView {
        val pad = (16 * resources.displayMetrics.density).toInt()
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(pad, pad * 2, pad, pad) }
        fun label(t: String, size: Float = 16f, color: Int = Color.parseColor("#B7B0A4")) = TextView(this).apply {
            text = t; textSize = size; setTextColor(color); typeface = Typeface.MONOSPACE; setPadding(0, pad / 2, 0, pad / 4)
        }
        fun field(hint: String, secret: Boolean = false) = EditText(this).apply {
            this.hint = hint; setSingleLine(); textSize = 14f; typeface = Typeface.MONOSPACE
            setTextColor(Color.parseColor("#E8E2D6")); setHintTextColor(Color.parseColor("#6B6459"))
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS or
                if (secret) InputType.TYPE_TEXT_VARIATION_PASSWORD else InputType.TYPE_TEXT_VARIATION_URI
        }
        col.addView(label("pair with Lax", 28f, Color.parseColor("#D97757")))
        status = label("", 15f, Color.parseColor("#E8E2D6"))
        col.addView(status)
        col.addView(label("Lax URL (with ?t=token)")); url = field("https://lax.example.com/?t=…"); col.addView(url)
        col.addView(label("Access client id (optional)")); cfId = field("….access"); col.addView(cfId)
        col.addView(label("Access client secret (optional)")); cfSecret = field("…", secret = true); col.addView(cfSecret)
        col.addView(Button(this).apply {
            text = "pair ▶"; textSize = 18f; typeface = Typeface.MONOSPACE
            setTextColor(Color.BLACK); setBackgroundColor(Color.parseColor("#D97757"))
            setOnClickListener { pair() }
        }, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { topMargin = pad })
        return ScrollView(this).apply {
            setBackgroundColor(Color.BLACK); isFillViewport = true
            addView(col, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { gravity = Gravity.TOP })
        }
    }
}
