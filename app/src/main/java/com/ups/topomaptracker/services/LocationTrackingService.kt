package com.ups.topomaptracker.services

import android.Manifest
import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.*
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.database.FirebaseDatabase
import com.ups.topomaptracker.MainActivity
import com.ups.topomaptracker.MyApplication
import com.ups.topomaptracker.R
import com.ups.topomaptracker.models.LocationData

class LocationTrackingService : Service() {

    private var lastLocation: android.location.Location? = null
    private val MIN_DISTANCE_CHANGE = 2.0f // metros
    private val MIN_TIME_CHANGE = 10000L // 10 segundos

    companion object {
        private const val NOTIFICATION_ID = 1001
        private const val LOCATION_UPDATE_INTERVAL = 15000L // 10 segundos
        private const val FASTEST_LOCATION_INTERVAL = 10000L // 5 segundos

        fun startService(context: Context) {
            val intent = Intent(context, LocationTrackingService::class.java)
            ContextCompat.startForegroundService(context, intent)
        }

        fun stopService(context: Context) {
            val intent = Intent(context, LocationTrackingService::class.java)
            context.stopService(intent)
        }
    }

    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var locationRequest: LocationRequest
    private lateinit var locationCallback: LocationCallback
    private lateinit var auth: FirebaseAuth
    private lateinit var database: FirebaseDatabase

    override fun onCreate() {
        super.onCreate()

        auth = FirebaseAuth.getInstance()
        database = FirebaseDatabase.getInstance()
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)

        createLocationRequest()
        createLocationCallback()

        Log.d("LocationService", "Servicio creado")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d("LocationService", "Servicio iniciado")

        startForeground(NOTIFICATION_ID, createNotification())
        startLocationUpdates()

        return START_STICKY // Se reinicia automáticamente si es terminado
    }

    override fun onDestroy() {
        super.onDestroy()
        stopLocationUpdates()
        Log.d("LocationService", "Servicio destruido")
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createLocationRequest() {
        locationRequest = LocationRequest.Builder(
            Priority.PRIORITY_BALANCED_POWER_ACCURACY,
            LOCATION_UPDATE_INTERVAL
        )
            .setMinUpdateIntervalMillis(FASTEST_LOCATION_INTERVAL)
            .setWaitForAccurateLocation(false)
            .setMinUpdateDistanceMeters(3.0f)
            .build()
    }

    private fun createLocationCallback() {
        locationCallback = object : LocationCallback() {
            override fun onLocationResult(locationResult: LocationResult) {
                val location = locationResult.lastLocation
                if (location != null) {
                    saveLocationToFirebase(location)
                    updateNotification(location)
                }
            }
        }
    }

    private fun startLocationUpdates() {
        if (!hasLocationPermissions()) {
            Log.e("LocationService", "No hay permisos de ubicación")
            stopSelf()
            return
        }

        try {
            fusedLocationClient.requestLocationUpdates(
                locationRequest,
                locationCallback,
                Looper.getMainLooper()
            )
            Log.d("LocationService", "Updates de ubicación iniciados")
        } catch (e: SecurityException) {
            Log.e("LocationService", "Error de permisos: ${e.message}")
            stopSelf()
        }
    }

    private fun stopLocationUpdates() {
        fusedLocationClient.removeLocationUpdates(locationCallback)
        Log.d("LocationService", "Updates de ubicación detenidos")
    }

    private fun saveLocationToFirebase(location: android.location.Location) {
        val userId = auth.currentUser?.uid ?: return

        // Solo guardar si la precisión es aceptable
        if (location.hasAccuracy() && location.accuracy > 50.0f) {
            Log.d("LocationService", "Ubicación descartada por baja precisión: ${location.accuracy}")
            return
        }

        // Filtrar ubicaciones muy cercanas o muy rápidas
        if (shouldUpdateLocation(location)) {
            val locationData = LocationData(
                latitude = location.latitude,
                longitude = location.longitude,
                timestamp = System.currentTimeMillis()
            )

            database.reference.child("user_locations").child(userId)
                .setValue(locationData)
                .addOnSuccessListener {
                    lastLocation = location
                    Log.d("LocationService", "Ubicación filtrada guardada: ${location.latitude}, ${location.longitude}")
                }
        }
    }

    private fun shouldUpdateLocation(newLocation: android.location.Location): Boolean {
        val lastLoc = lastLocation ?: return true

        val distance = lastLoc.distanceTo(newLocation)
        val timeDiff = newLocation.time - lastLoc.time

        // Solo actualizar si se movió más de MIN_DISTANCE_CHANGE metros
        // O pasó más de MIN_TIME_CHANGE tiempo
        return distance > MIN_DISTANCE_CHANGE || timeDiff > MIN_TIME_CHANGE
    }


    private fun createNotification(): Notification {
        val notificationIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, notificationIntent,
            PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, MyApplication.LOCATION_CHANNEL_ID)
            .setContentTitle("TopoMapTracker")
            .setContentText("Tracking de ubicación activo")
            .setSmallIcon(R.drawable.ic_location_on)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setSilent(true)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    private fun updateNotification(location: android.location.Location) {
        val notification = NotificationCompat.Builder(this, MyApplication.LOCATION_CHANNEL_ID)
            .setContentTitle("TopoMapTracker")
            .setContentText("Ubicación: ${String.format("%.6f", location.latitude)}, ${String.format("%.6f", location.longitude)}")
            .setSmallIcon(R.drawable.ic_location_on)
            .setOngoing(true)
            .setSilent(true)
            .build()

        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    private fun hasLocationPermissions(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED &&
                ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                ) == PackageManager.PERMISSION_GRANTED
    }
}