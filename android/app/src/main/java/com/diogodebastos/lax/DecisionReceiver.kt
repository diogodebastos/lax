package com.diogodebastos.lax

import android.app.Notification
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import org.json.JSONObject

/** Approve / Deny tapped on a notification (lock screen, cover screen or shade) → POST /api/decide on the Mac. */
class DecisionReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val id = intent.getStringExtra("id") ?: return
        val decision = intent.getStringExtra("decision") ?: return
        val cfg = Lax.config(ctx) ?: return
        val done = goAsync()
        Thread {
            val nm = ctx.getSystemService(NotificationManager::class.java)
            val code = Lax.post(cfg, "/api/decide", JSONObject().put("id", id).put("decision", decision))
            if (code == 200) nm.cancel(LaxService.notifId(id))
            else nm.notify(3, Notification.Builder(ctx, LaxService.CH_ASK)
                .setSmallIcon(R.drawable.ic_stat_lax)
                .setContentTitle("Couldn't reach your Mac")
                .setContentText("Your ${if (decision == "allow") "approval" else "denial"} didn't arrive. Try again.")
                .setAutoCancel(true)
                .setTimeoutAfter(60_000)
                .build())
            done.finish()
        }.start()
    }
}
