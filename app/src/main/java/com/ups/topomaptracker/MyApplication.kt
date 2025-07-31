package com.ups.topomaptracker

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import org.osmdroid.config.Configuration
import java.io.File

class MyApplication : Application() {
    companion object {
        const val LOCATION_CHANNEL_ID = "location_tracking_channel"
    }

    override fun onCreate() {
        super.onCreate()

        // Configurar OSMDroid
        Configuration.getInstance().apply {
            userAgentValue = packageName
            val basePath = File(cacheDir, "osmdroid")
            val tileCache = File(basePath, "tile")
            if (!basePath.exists()) basePath.mkdirs()
            if (!tileCache.exists()) tileCache.mkdirs()
            setCacheMapTileCount(200)
            setCacheMapTileOvershoot(100)
        }

        // Crear canal de notificación
        createNotificationChannel()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                LOCATION_CHANNEL_ID,
                "Tracking de Ubicación",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Notificación para el tracking de ubicación en segundo plano"
                setShowBadge(false)
            }

            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }
}