package com.diogodebastos.lax

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import java.io.File

// What Lax hands to another app (its timelapse, to WhatsApp): files it wrote to cache/share, read-only, and only for
// the app it was shared with (the share intent grants it). Not exported; nothing else of Lax's is reachable through it.
class SharedFiles : ContentProvider() {
    companion object {
        const val AUTHORITY = "com.diogodebastos.lax.share"
        private val NAME = Regex("^[a-z0-9-]{1,40}\\.(gif|png)$")
        fun dir(context: Context) = File(context.cacheDir, "share").apply { mkdirs() }
        fun uri(name: String): Uri = Uri.parse("content://$AUTHORITY/$name")
    }

    private fun file(uri: Uri): File? {
        val name = uri.lastPathSegment ?: return null
        if (!NAME.matches(name)) return null
        return File(dir(context!!), name).takeIf { it.isFile }
    }

    override fun onCreate() = true
    override fun getType(uri: Uri) = when (uri.lastPathSegment?.substringAfterLast('.')) { "gif" -> "image/gif"; "png" -> "image/png"; else -> null }
    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor? =
        file(uri)?.let { ParcelFileDescriptor.open(it, ParcelFileDescriptor.MODE_READ_ONLY) }
    // Its name and size, which WhatsApp and the share sheet ask for.
    override fun query(uri: Uri, projection: Array<String>?, selection: String?, args: Array<String>?, sort: String?): Cursor? {
        val f = file(uri) ?: return null
        return MatrixCursor(arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)).apply { addRow(arrayOf(f.name, f.length())) }
    }
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun update(uri: Uri, values: ContentValues?, selection: String?, args: Array<String>?) = 0
    override fun delete(uri: Uri, selection: String?, args: Array<String>?) = 0
}
