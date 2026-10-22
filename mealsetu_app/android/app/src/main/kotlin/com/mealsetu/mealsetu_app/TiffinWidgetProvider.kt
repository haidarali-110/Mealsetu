package com.mealsetu.mealsetu_app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.graphics.Color
import android.util.Log
import android.widget.RemoteViews
import es.antonborri.home_widget.HomeWidgetPlugin

class TiffinWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        Log.d(TAG, "onUpdate called for ${appWidgetIds.size} widget(s)")
        for (id in appWidgetIds) {
            try {
                updateWidget(context, appWidgetManager, id)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to update widget $id: ${e.message}", e)
            }
        }
    }

    override fun onEnabled(context: Context) {
        Log.d(TAG, "Widget enabled (first instance added)")
    }

    override fun onDisabled(context: Context) {
        Log.d(TAG, "Widget disabled (last instance removed)")
    }

    companion object {
        private const val TAG = "TiffinWidget"

        fun updateWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            // Use the official helper — guaranteed to read from the same
            // SharedPreferences file that HomeWidget.saveWidgetData() writes to.
            val prefs = HomeWidgetPlugin.getData(context)

            // Debug: dump every key in the prefs file so we can verify the data
            Log.d(TAG, "SharedPrefs file keys: ${prefs.all.keys}")
            Log.d(TAG, "SharedPrefs all values: ${prefs.all}")

            val vendorName  = prefs.getString("tw_vendor", null)
                ?.takeIf { it.isNotBlank() } ?: "Open app to load"
            val menu        = prefs.getString("tw_menu", null)
                ?.takeIf { it.isNotBlank() } ?: "Today's tiffin info appears here"
            val timeSlot    = prefs.getString("tw_time",   null) ?: ""
            val statusText  = prefs.getString("tw_status", null)
                ?.takeIf { it.isNotBlank() } ?: "Active"
            val statusColor = prefs.getString("tw_status_color", null) ?: "#22C55E"

            Log.d(TAG, "Widget data — vendor=$vendorName  status=$statusText  time=$timeSlot")

            val views = RemoteViews(context.packageName, R.layout.tiffin_widget_layout)
            views.setTextViewText(R.id.widget_vendor_name, vendorName)
            views.setTextViewText(R.id.widget_menu,        menu)
            views.setTextViewText(R.id.widget_time,        timeSlot)
            views.setTextViewText(R.id.widget_status,      statusText)

            try {
                views.setTextColor(R.id.widget_status, Color.parseColor(statusColor))
            } catch (e: Exception) {
                views.setTextColor(R.id.widget_status, Color.parseColor("#22C55E"))
            }

            // Tap → open app
            context.packageManager.getLaunchIntentForPackage(context.packageName)?.let { intent ->
                val pi = PendingIntent.getActivity(
                    context, 0, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                views.setOnClickPendingIntent(R.id.widget_root, pi)
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
            Log.d(TAG, "Widget $appWidgetId updated successfully")
        }
    }
}
