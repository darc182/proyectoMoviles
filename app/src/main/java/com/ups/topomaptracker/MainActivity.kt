package com.ups.topomaptracker

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.drawable.Drawable
import android.location.Location
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Bundle
import android.os.Looper
import android.util.Log
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polygon
import org.osmdroid.events.MapEventsReceiver
import org.osmdroid.views.overlay.MapEventsOverlay
import org.osmdroid.config.Configuration
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.database.*
import com.ups.topomaptracker.models.LocationData
import com.ups.topomaptracker.models.Terrain
import com.ups.topomaptracker.models.User
import com.ups.topomaptracker.services.LocationTrackingService
import com.google.android.gms.location.*
import java.util.*

class MainActivity : AppCompatActivity() {
    private lateinit var mapView: MapView
    private lateinit var database: FirebaseDatabase
    private lateinit var auth: FirebaseAuth
    private val terrainPoints = mutableListOf<GeoPoint>()
    private var currentPolygon: Polygon? = null
    private val userMarkers = mutableMapOf<String, Marker>()
    private val terrainMarkers = mutableListOf<Marker>()
    private var currentUser: User? = null

    // Variables para tracking y ubicación actual
    private val companionMarkers = mutableMapOf<String, Marker>()
    private var isTrackingLocation = false
    private var btnToggleTracking: Button? = null
    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private var myLocationMarker: Marker? = null
    private var myLocationCallback: LocationCallback? = null

    // Variables para terrenos colaborativos
    private var currentSessionId: String? = null
    private var isSessionActive = false
    private val sessionPoints = mutableMapOf<String, LocationData>()
    private var sessionPolygon: Polygon? = null
    private var btnCreateSession: Button? = null
    private var btnJoinSession: Button? = null
    private var btnFinishSession: Button? = null


    private var lastKnownPosition: GeoPoint? = null

    companion object {
        private const val LOCATION_REQUEST_CODE = 1001
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        try {
            setContentView(R.layout.activity_main)

            auth = FirebaseAuth.getInstance()
            database = FirebaseDatabase.getInstance()
            fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)

            if (!verifyFirebaseAuth()) return

            setupMap()
            setupButtons()
            loadCurrentUser()
            requestLocationPermissions()

        } catch (e: Exception) {
            Log.e("MainActivity", "Error en onCreate: ${e.message}", e)
            Toast.makeText(this, "Error inicializando app: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun checkInternetConnection(): Boolean {
        val connectivityManager = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = connectivityManager.activeNetwork
        val capabilities = connectivityManager.getNetworkCapabilities(network)
        return capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
    }

    private fun verifyFirebaseAuth(): Boolean {
        val currentUser = auth.currentUser
        if (currentUser == null) {
            Toast.makeText(this, "No estás autenticado. Volviendo al login...", Toast.LENGTH_LONG).show()
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return false
        }

        // Verificar si el usuario existe en la base de datos
        val userId = currentUser.uid
        database.reference.child("users").child(userId)
            .addListenerForSingleValueEvent(object : ValueEventListener {
                override fun onDataChange(snapshot: DataSnapshot) {
                    if (!snapshot.exists()) {
                        // Usuario eliminado de la base de datos
                        Toast.makeText(this@MainActivity, "Tu cuenta ha sido eliminada. Contacta al administrador.", Toast.LENGTH_LONG).show()
                        auth.signOut()
                        startActivity(Intent(this@MainActivity, LoginActivity::class.java))
                        finish()
                    }
                }
                override fun onCancelled(error: DatabaseError) {
                    Log.e("MainActivity", "Error verificando usuario: ${error.message}")
                }
            })

        Log.d("MainActivity", "Usuario autenticado: ${currentUser.uid}")
        return true
    }


    // FUNCIONES COLABORATIVAS COMPLETAS
    private fun generateSessionCode(): String {
        return (100000..999999).random().toString()
    }

    private fun createCollaborativeSession() {
        if (!checkInternetConnection()) {
            Toast.makeText(this, "Sin conexión a internet", Toast.LENGTH_LONG).show()
            return
        }

        if (!verifyFirebaseAuth()) return

        val sessionCode = generateSessionCode()
        val sessionId = UUID.randomUUID().toString()
        val userId = auth.currentUser?.uid ?: return

        Log.d("MainActivity", "Creando sesión - Usuario: $userId, Código: $sessionCode")

        val participantsMap = mutableMapOf<String, Any>()
        participantsMap[userId] = currentUser?.name ?: "Usuario"

        val sessionData = mutableMapOf<String, Any>()
        sessionData["id"] = sessionId
        sessionData["code"] = sessionCode
        sessionData["creator"] = userId
        sessionData["createdAt"] = System.currentTimeMillis()
        sessionData["participants"] = participantsMap
        sessionData["status"] = "active"

        database.reference.child("collaborative_sessions").child(sessionId)
            .setValue(sessionData)
            .addOnSuccessListener {
                database.reference.child("session_codes").child(sessionCode)
                    .setValue(sessionId)
                    .addOnSuccessListener {
                        Log.d("MainActivity", "Sesión creada exitosamente")
                        showSessionCodeDialog(sessionCode, sessionId, true)
                        startCollaborativeSession(sessionId, true)
                    }
                    .addOnFailureListener { error ->
                        Log.e("MainActivity", "Error guardando código: ${error.message}")
                        Toast.makeText(this, "Error creando código: ${error.message}", Toast.LENGTH_LONG).show()
                    }
            }
            .addOnFailureListener { error ->
                Log.e("MainActivity", "Error creando sesión: ${error.message}")
                Toast.makeText(this, "Error creando sesión: ${error.message}", Toast.LENGTH_LONG).show()
            }
    }

    private fun showSessionCodeDialog(sessionCode: String, sessionId: String, isCreator: Boolean) {
        val message = if (isCreator) {
            "✅ Sesión creada exitosamente\n\n📱 Código: $sessionCode\n\nComparte este código con tu equipo para que se unan a la sesión colaborativa."
        } else {
            "✅ Te has unido exitosamente a la sesión\n\n📱 Código: $sessionCode\n\nYa puedes empezar a agregar puntos al terreno colaborativo."
        }

        AlertDialog.Builder(this)
            .setTitle(if (isCreator) "Sesión Creada" else "Sesión Unida")
            .setMessage(message)
            .setPositiveButton("Continuar") { _, _ ->
                Toast.makeText(this, "Sesión colaborativa activa", Toast.LENGTH_SHORT).show()
            }
            .setNeutralButton("Compartir Código") { _, _ ->
                shareSessionCode(sessionCode)
            }
            .setCancelable(false)
            .show()
    }

    private fun shareSessionCode(sessionCode: String) {
        val shareIntent = Intent().apply {
            action = Intent.ACTION_SEND
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT,
                "¡Únete a mi sesión de TopoMapTracker!\n\n" +
                        "Código: $sessionCode\n\n" +
                        "Usa este código en la app para colaborar en tiempo real."
            )
            putExtra(Intent.EXTRA_SUBJECT, "Código de Sesión TopoMapTracker")
        }

        try {
            startActivity(Intent.createChooser(shareIntent, "Compartir código de sesión"))
        } catch (e: Exception) {
            Toast.makeText(this, "Error compartiendo código", Toast.LENGTH_SHORT).show()
        }
    }

    private fun joinCollaborativeSession() {
        val input = android.widget.EditText(this).apply {
            hint = "Ejemplo: 123456"
            inputType = android.text.InputType.TYPE_CLASS_NUMBER
            filters = arrayOf(android.text.InputFilter.LengthFilter(6))
        }

        AlertDialog.Builder(this)
            .setTitle("Unirse a Sesión")
            .setMessage("Ingresa el código de 6 dígitos:")
            .setView(input)
            .setPositiveButton("Unirse") { _, _ ->
                val code = input.text.toString().trim()
                if (code.length == 6) {
                    findSessionByCode(code)
                } else {
                    Toast.makeText(this, "Código debe tener 6 dígitos", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun findSessionByCode(sessionCode: String) {
        database.reference.child("session_codes").child(sessionCode)
            .get()
            .addOnSuccessListener { snapshot ->
                if (snapshot.exists()) {
                    val sessionId = snapshot.getValue(String::class.java)
                    if (sessionId != null) {
                        validateAndJoinSession(sessionId, sessionCode)
                    } else {
                        Toast.makeText(this, "Código de sesión inválido", Toast.LENGTH_SHORT).show()
                    }
                } else {
                    Toast.makeText(this, "Código de sesión no encontrado", Toast.LENGTH_SHORT).show()
                }
            }
            .addOnFailureListener { error ->
                Toast.makeText(this, "Error buscando sesión: ${error.message}", Toast.LENGTH_SHORT).show()
            }
    }

    private fun validateAndJoinSession(sessionId: String, sessionCode: String) {
        database.reference.child("collaborative_sessions").child(sessionId)
            .get()
            .addOnSuccessListener { snapshot ->
                if (snapshot.exists()) {
                    val sessionData = snapshot.value as? Map<String, Any>
                    val status = sessionData?.get("status") as? String

                    if (status == "active") {
                        // Agregar usuario a participantes
                        val userId = auth.currentUser?.uid ?: return@addOnSuccessListener
                        val userName = currentUser?.name ?: "Usuario"

                        database.reference.child("collaborative_sessions")
                            .child(sessionId)
                            .child("participants")
                            .child(userId)
                            .setValue(userName)
                            .addOnSuccessListener {
                                showSessionCodeDialog(sessionCode, sessionId, false)
                                startCollaborativeSession(sessionId, false)
                            }
                            .addOnFailureListener {
                                Toast.makeText(this, "Error uniéndose a sesión", Toast.LENGTH_SHORT).show()
                            }
                    } else {
                        Toast.makeText(this, "La sesión no está activa", Toast.LENGTH_SHORT).show()
                    }
                } else {
                    Toast.makeText(this, "Sesión no encontrada", Toast.LENGTH_SHORT).show()
                }
            }
            .addOnFailureListener { error ->
                Toast.makeText(this, "Error validando sesión: ${error.message}", Toast.LENGTH_SHORT).show()
            }
    }

    private fun startCollaborativeSession(sessionId: String, isCreator: Boolean) {
        currentSessionId = sessionId
        isSessionActive = true

        listenToSessionPoints(sessionId)
        listenToSessionParticipants(sessionId)

        if (!isTrackingLocation) {
            startLocationTracking()
        }

        updateSessionUI()
        Log.d("MainActivity", "Sesión colaborativa iniciada: $sessionId")
    }

    private fun listenToSessionParticipants(sessionId: String) {
        database.reference.child("collaborative_sessions").child(sessionId).child("participants")
            .addValueEventListener(object : ValueEventListener {
                override fun onDataChange(snapshot: DataSnapshot) {
                    val participantCount = snapshot.childrenCount
                    Log.d("MainActivity", "Participantes en sesión: $participantCount")
                    Toast.makeText(this@MainActivity, "Participantes: $participantCount", Toast.LENGTH_SHORT).show()
                }

                override fun onCancelled(error: DatabaseError) {
                    Log.e("MainActivity", "Error escuchando participantes: ${error.message}")
                }
            })
    }

    private fun listenToSessionPoints(sessionId: String) {
        database.reference.child("session_points").child(sessionId)
            .addValueEventListener(object : ValueEventListener {
                override fun onDataChange(snapshot: DataSnapshot) {
                    sessionPoints.clear()
                    for (pointSnapshot in snapshot.children) {
                        val pointData = pointSnapshot.getValue(LocationData::class.java)
                        if (pointData != null) {
                            sessionPoints[pointSnapshot.key!!] = pointData
                        }
                    }
                    updateSessionPolygon()
                    Log.d("MainActivity", "Puntos de sesión actualizados: ${sessionPoints.size}")
                }

                override fun onCancelled(error: DatabaseError) {
                    Log.e("MainActivity", "Error escuchando puntos: ${error.message}")
                }
            })
    }

    private fun updateSessionPolygon() {
        try {
            sessionPolygon?.let { mapView.overlays.remove(it) }

            if (sessionPoints.size >= 2) {
                val geoPoints = sessionPoints.values.map {
                    GeoPoint(it.latitude, it.longitude)
                }

                sessionPolygon = Polygon().apply {
                    points = geoPoints
                    fillColor = Color.argb(50, 0, 255, 0)
                    strokeColor = Color.GREEN
                    strokeWidth = 3.0f
                }

                mapView.overlays.add(sessionPolygon)
                mapView.invalidate()

                if (sessionPoints.size >= 3) {
                    val area = calculateAreaFromPoints(geoPoints)
                    Log.d("MainActivity", "Área colaborativa: ${String.format("%.2f", area)} m²")
                }
            }
        } catch (e: Exception) {
            Log.e("MainActivity", "Error actualizando polígono de sesión: ${e.message}")
        }
    }

    private fun addMyPointToSession() {
        if (!isSessionActive || currentSessionId == null) {
            Toast.makeText(this, "No hay sesión activa", Toast.LENGTH_SHORT).show()
            return
        }

        if (!hasLocationPermissions()) {
            requestLocationPermissions()
            return
        }

        try {
            fusedLocationClient.lastLocation.addOnSuccessListener { location ->
                if (location != null) {
                    val pointId = UUID.randomUUID().toString()
                    val locationData = LocationData(
                        latitude = location.latitude,
                        longitude = location.longitude,
                        timestamp = System.currentTimeMillis()
                    )

                    database.reference.child("session_points")
                        .child(currentSessionId!!)
                        .child(pointId)
                        .setValue(locationData)
                        .addOnSuccessListener {
                            Toast.makeText(this, "Punto agregado a la sesión", Toast.LENGTH_SHORT).show()
                        }
                        .addOnFailureListener {
                            Toast.makeText(this, "Error agregando punto", Toast.LENGTH_SHORT).show()
                        }
                } else {
                    requestNewLocation()
                }
            }
        } catch (e: SecurityException) {
            Log.e("MainActivity", "Error de permisos: ${e.message}")
        }
    }

    private fun finishCollaborativeSession() {
        if (!isSessionActive || currentSessionId == null) {
            Toast.makeText(this, "No hay sesión activa", Toast.LENGTH_SHORT).show()
            return
        }

        if (sessionPoints.size < 3) {
            Toast.makeText(this, "Se necesitan al menos 3 puntos para guardar el terreno", Toast.LENGTH_LONG).show()
            return
        }

        AlertDialog.Builder(this)
            .setTitle("Finalizar Sesión")
            .setMessage("¿Guardar terreno colaborativo con ${sessionPoints.size} puntos?")
            .setPositiveButton("Guardar") { _, _ ->
                saveCollaborativeTerrain()
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun saveCollaborativeTerrain() {
        try {
            val terrainId = UUID.randomUUID().toString()
            val points = sessionPoints.values.toList()
            val geoPoints = points.map { GeoPoint(it.latitude, it.longitude) }
            val area = calculateAreaFromPoints(geoPoints)

            val terrain = Terrain(
                id = terrainId,
                name = "Terreno Colaborativo ${Date()}",
                points = points,
                area = area,
                createdBy = currentSessionId!!,
                createdAt = System.currentTimeMillis()
            )

            database.reference.child("terrains").child(terrainId)
                .setValue(terrain)
                .addOnSuccessListener {
                    // Marcar sesión como finalizada
                    database.reference.child("collaborative_sessions")
                        .child(currentSessionId!!)
                        .child("status")
                        .setValue("completed")

                    Toast.makeText(this, "Terreno colaborativo guardado exitosamente", Toast.LENGTH_LONG).show()
                    endCollaborativeSession()
                }
                .addOnFailureListener { error ->
                    Toast.makeText(this, "Error guardando terreno: ${error.message}", Toast.LENGTH_LONG).show()
                }
        } catch (e: Exception) {
            Log.e("MainActivity", "Error en saveCollaborativeTerrain: ${e.message}")
            Toast.makeText(this, "Error: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun endCollaborativeSession() {
        isSessionActive = false
        currentSessionId = null
        sessionPoints.clear()
        sessionPolygon?.let { mapView.overlays.remove(it) }
        sessionPolygon = null
        mapView.invalidate()
        updateSessionUI()
    }

    private fun calculateAreaFromPoints(points: List<GeoPoint>): Double {
        if (points.size < 3) return 0.0

        var area = 0.0
        val n = points.size

        for (i in 0 until n) {
            val j = (i + 1) % n
            area += points[i].longitude * points[j].latitude
            area -= points[j].longitude * points[i].latitude
        }

        return Math.abs(area) / 2.0 * 111320 * 111320
    }

    private fun updateSessionUI() {
        btnCreateSession?.isEnabled = !isSessionActive
        btnJoinSession?.isEnabled = !isSessionActive
        btnFinishSession?.isEnabled = isSessionActive
        findViewById<Button>(R.id.btnAddPoint)?.isEnabled = isSessionActive

        if (isSessionActive) {
            Toast.makeText(this, "Sesión colaborativa activa - Puedes agregar puntos", Toast.LENGTH_SHORT).show()
        }
    }

    // RESTO DE FUNCIONES (sin cambios)
    private fun requestLocationPermissions() {
        val permissions = arrayOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )

        val permissionsToRequest = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (permissionsToRequest.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, permissionsToRequest.toTypedArray(), LOCATION_REQUEST_CODE)
        } else {
            getCurrentLocation()
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)

        if (requestCode == LOCATION_REQUEST_CODE) {
            if (grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }) {
                getCurrentLocation()
            } else {
                Toast.makeText(this, "Permisos de ubicación requeridos", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun getCurrentLocation() {
        if (!hasLocationPermissions()) {
            Log.w("MainActivity", "No hay permisos para obtener ubicación")
            return
        }

        try {
            fusedLocationClient.lastLocation.addOnSuccessListener { location ->
                if (location != null) {
                    val geoPoint = GeoPoint(location.latitude, location.longitude)
                    showMyLocationOnMap(geoPoint)
                    mapView.controller.setCenter(geoPoint)
                    mapView.controller.setZoom(16.0)
                } else {
                    requestNewLocation()
                }
            }
        } catch (e: SecurityException) {
            Log.e("MainActivity", "Error de permisos: ${e.message}")
        }
    }

    private fun requestNewLocation() {
        if (!hasLocationPermissions()) {
            return
        }

        val locationRequest = LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY,
            1000L
        ).build()

        val singleLocationCallback = object : LocationCallback() {
            override fun onLocationResult(locationResult: LocationResult) {
                val location = locationResult.lastLocation
                if (location != null) {
                    val geoPoint = GeoPoint(location.latitude, location.longitude)
                    showMyLocationOnMap(geoPoint)
                    mapView.controller.setCenter(geoPoint)
                    mapView.controller.setZoom(16.0)
                }
                fusedLocationClient.removeLocationUpdates(this)
            }
        }

        try {
            fusedLocationClient.requestLocationUpdates(locationRequest, singleLocationCallback, Looper.getMainLooper())
        } catch (e: SecurityException) {
            Log.e("MainActivity", "Error solicitando nueva ubicación: ${e.message}")
        }
    }

    private fun hasLocationPermissions(): Boolean {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED &&
                ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
    }

    private fun showMyLocationOnMap(location: GeoPoint) {
        try {
            // Aplicar suavizado si la distancia es muy pequeña
            val smoothedLocation = if (lastKnownPosition != null) {
                val distance = lastKnownPosition!!.distanceToAsDouble(location)
                if (distance < 5.0) { // Si se movió menos de 5 metros, suavizar
                    smoothLocation(lastKnownPosition!!, location)
                } else {
                    location
                }
            } else {
                location
            }

            myLocationMarker?.let { mapView.overlays.remove(it) }

            myLocationMarker = Marker(mapView).apply {
                position = smoothedLocation
                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                title = "Mi Ubicación"
                snippet = "Lat: ${String.format("%.6f", smoothedLocation.latitude)}, Lon: ${String.format("%.6f", smoothedLocation.longitude)}"

                try {
                    icon = ContextCompat.getDrawable(this@MainActivity, R.drawable.ic_location_on)
                } catch (e: Exception) {
                    Log.w("MainActivity", "No se pudo cargar icono personalizado")
                }
            }

            mapView.overlays.add(myLocationMarker)
            mapView.invalidate()

            lastKnownPosition = smoothedLocation
        } catch (e: Exception) {
            Log.e("MainActivity", "Error mostrando mi ubicación: ${e.message}")
        }
    }


    private fun smoothLocation(lastPos: GeoPoint, newPos: GeoPoint): GeoPoint {
        // Suavizado simple: promedio ponderado
        val factor = 0.7 // 70% nueva posición, 30% anterior
        val smoothLat = lastPos.latitude * (1 - factor) + newPos.latitude * factor
        val smoothLon = lastPos.longitude * (1 - factor) + newPos.longitude * factor
        return GeoPoint(smoothLat, smoothLon)
    }


    private fun startRealTimeLocationTracking() {
        if (!hasLocationPermissions()) {
            Log.w("MainActivity", "No hay permisos para tracking en tiempo real")
            requestLocationPermissions()
            return
        }

        val locationRequest = LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY,
            5000L
        )
            .setMinUpdateIntervalMillis(2000L)
            .build()

        myLocationCallback = object : LocationCallback() {
            override fun onLocationResult(locationResult: LocationResult) {
                val location = locationResult.lastLocation
                if (location != null) {
                    val geoPoint = GeoPoint(location.latitude, location.longitude)
                    showMyLocationOnMap(geoPoint)
                }
            }
        }

        try {
            fusedLocationClient.requestLocationUpdates(locationRequest, myLocationCallback!!, Looper.getMainLooper())
            Log.d("MainActivity", "Tracking de mi ubicación en tiempo real iniciado")
        } catch (e: SecurityException) {
            Log.e("MainActivity", "Error iniciando tracking en tiempo real: ${e.message}")
        }
    }

    private fun stopRealTimeLocationTracking() {
        myLocationCallback?.let {
            fusedLocationClient.removeLocationUpdates(it)
            myLocationCallback = null
            Log.d("MainActivity", "Tracking de mi ubicación en tiempo real detenido")
        }
    }

    private fun startLocationTracking() {
        Log.d("MainActivity", "Intentando iniciar tracking...")

        if (!hasLocationPermissions()) {
            Log.w("MainActivity", "Permisos de ubicación requeridos")
            Toast.makeText(this, "Se requieren permisos de ubicación", Toast.LENGTH_LONG).show()
            requestLocationPermissions()
            return
        }

        if (!isTrackingLocation) {
            try {
                fusedLocationClient.lastLocation.addOnSuccessListener { location ->
                    if (location != null) {
                        val geoPoint = GeoPoint(location.latitude, location.longitude)
                        showMyLocationOnMap(geoPoint)
                        mapView.controller.setCenter(geoPoint)
                        mapView.controller.setZoom(16.0)
                    }
                }
            } catch (e: SecurityException) {
                Log.e("MainActivity", "Error obteniendo ubicación inicial: ${e.message}")
            }

            LocationTrackingService.startService(this)
            startRealTimeLocationTracking()
            listenToCompanionLocations()

            isTrackingLocation = true

            btnToggleTracking?.text = "Detener Tracking"
            btnToggleTracking?.setBackgroundColor(ContextCompat.getColor(this, android.R.color.holo_red_dark))

            Toast.makeText(this, "Tracking iniciado - Tu ubicación se actualiza en tiempo real", Toast.LENGTH_LONG).show()
            Log.d("MainActivity", "Tracking iniciado exitosamente")
        }
    }

    private fun stopLocationTracking() {
        Log.d("MainActivity", "Deteniendo tracking...")

        if (isTrackingLocation) {
            LocationTrackingService.stopService(this)
            stopRealTimeLocationTracking()

            isTrackingLocation = false

            companionMarkers.values.forEach { mapView.overlays.remove(it) }
            companionMarkers.clear()
            mapView.invalidate()

            btnToggleTracking?.text = "Iniciar Tracking"
            btnToggleTracking?.setBackgroundColor(ContextCompat.getColor(this, android.R.color.holo_green_dark))

            Toast.makeText(this, "Tracking detenido", Toast.LENGTH_SHORT).show()
            Log.d("MainActivity", "Tracking detenido exitosamente")
        }
    }

    private fun listenToCompanionLocations() {
        val currentUserId = auth.currentUser?.uid ?: return

        Log.d("MainActivity", "Escuchando ubicaciones de compañeros...")

        database.reference.child("user_locations")
            .addValueEventListener(object : ValueEventListener {
                override fun onDataChange(snapshot: DataSnapshot) {
                    for (userSnapshot in snapshot.children) {
                        val userId = userSnapshot.key ?: continue
                        if (userId != currentUserId) {
                            val locationData = userSnapshot.getValue(LocationData::class.java)
                            if (locationData != null) {
                                database.reference.child("users").child(userId)
                                    .addListenerForSingleValueEvent(object : ValueEventListener {
                                        override fun onDataChange(userDataSnapshot: DataSnapshot) {
                                            val user = userDataSnapshot.getValue(User::class.java)
                                            if (user != null) {
                                                createCompanionMarker(user, locationData)
                                            }
                                        }
                                        override fun onCancelled(error: DatabaseError) {}
                                    })
                            }
                        }
                    }
                }

                override fun onCancelled(error: DatabaseError) {
                    Log.e("MainActivity", "Error escuchando ubicaciones: ${error.message}")
                }
            })
    }

    private fun createCompanionMarker(user: User, location: LocationData) {
        try {
            companionMarkers[user.id]?.let { mapView.overlays.remove(it) }

            val marker = Marker(mapView).apply {
                position = GeoPoint(location.latitude, location.longitude)
                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                title = "${user.name} (${user.role})"
                snippet = "Última actualización: ${formatTimestamp(location.timestamp)}"

                try {
                    icon = ContextCompat.getDrawable(this@MainActivity, R.drawable.ic_location_on)?.apply {
                        setTint(when(user.role) {
                            "Administrador" -> Color.RED
                            "Supervisor" -> Color.BLUE
                            else -> Color.GREEN
                        })
                    }
                } catch (e: Exception) {
                    Log.w("MainActivity", "Error configurando icono de compañero")
                }
            }

            companionMarkers[user.id] = marker
            mapView.overlays.add(marker)
            mapView.invalidate()

        } catch (e: Exception) {
            Log.e("MainActivity", "Error creando marcador de compañero: ${e.message}")
        }
    }

    private fun formatTimestamp(timestamp: Long): String {
        val diff = System.currentTimeMillis() - timestamp
        return when {
            diff < 60000 -> "Hace ${diff / 1000}s"
            diff < 3600000 -> "Hace ${diff / 60000}m"
            else -> "Hace ${diff / 3600000}h"
        }
    }

    private fun loadCurrentUser() {
        val userId = auth.currentUser?.uid ?: return

        database.reference.child("users").child(userId)
            .addListenerForSingleValueEvent(object : ValueEventListener {
                override fun onDataChange(snapshot: DataSnapshot) {
                    currentUser = snapshot.getValue(User::class.java)
                    updateUI()
                }

                override fun onCancelled(error: DatabaseError) {
                    Log.e("MainActivity", "Error cargando usuario: ${error.message}")
                }
            })
    }

    private fun updateUI() {
        currentUser?.let { user ->
            findViewById<TextView>(R.id.tvUserName).text = user.name
            findViewById<TextView>(R.id.tvUserRole).text = user.role
            configureRoleBasedAccess(user.role)
        }
    }

    private fun configureRoleBasedAccess(role: String) {
        val btnSaveTerrain = findViewById<Button>(R.id.btnSaveTerrain)
        val btnViewTerrains = findViewById<Button>(R.id.btnViewTerrains)
        val btnCreateUser = findViewById<Button?>(R.id.btnCreateUser) // Null-safe

        when (role) {
            "Topógrafo" -> {
                btnSaveTerrain.isEnabled = true
                btnViewTerrains.isEnabled = true
                btnCreateUser?.visibility = Button.GONE
            }
            "Supervisor" -> {
                btnSaveTerrain.isEnabled = true
                btnViewTerrains.isEnabled = true
                btnCreateUser?.visibility = Button.VISIBLE
                btnCreateUser?.isEnabled = true
            }
            "Administrador" -> {
                btnSaveTerrain.isEnabled = true
                btnViewTerrains.isEnabled = true
                btnCreateUser?.visibility = Button.VISIBLE
                btnCreateUser?.isEnabled = true
            }
            else -> {
                btnSaveTerrain.isEnabled = false
                btnViewTerrains.isEnabled = false
                btnCreateUser?.visibility = Button.GONE
            }
        }
    }

    private fun canCreateUsers(): Boolean {
        return currentUser?.role in arrayOf("Administrador", "Supervisor")
    }

    private fun setupButtons() {
        try {
            btnToggleTracking = findViewById<Button>(R.id.btnToggleTracking)
            btnCreateSession = findViewById<Button>(R.id.btnCreateSession)
            btnJoinSession = findViewById<Button>(R.id.btnJoinSession)
            btnFinishSession = findViewById<Button>(R.id.btnFinishSession)

            findViewById<Button>(R.id.btnLogout).setOnClickListener { showLogoutDialog() }
            findViewById<Button>(R.id.btnClearPoints).setOnClickListener { clearTerrain() }
            findViewById<Button>(R.id.btnSaveTerrain).setOnClickListener { saveTerrain() }
            findViewById<Button>(R.id.btnViewTerrains).setOnClickListener { viewTerrains() }

            // Manejo seguro del botón crear usuario
            val btnCreateUser = findViewById<Button?>(R.id.btnCreateUser)
            btnCreateUser?.setOnClickListener {
                if (canCreateUsers()) {
                    startActivity(Intent(this, RegisterActivity::class.java))
                } else {
                    Toast.makeText(this, "No tienes permisos para crear usuarios", Toast.LENGTH_SHORT).show()
                }
            }

            btnToggleTracking?.setOnClickListener {
                if (isTrackingLocation) stopLocationTracking() else startLocationTracking()
            }

            btnCreateSession?.setOnClickListener { createCollaborativeSession() }
            btnJoinSession?.setOnClickListener { joinCollaborativeSession() }
            btnFinishSession?.setOnClickListener { finishCollaborativeSession() }
            findViewById<Button>(R.id.btnAddPoint).setOnClickListener { addMyPointToSession() }

            updateSessionUI()

        } catch (e: Exception) {
            Log.e("MainActivity", "Error configurando botones: ${e.message}")
        }
    }



    private fun viewTerrains() {
        currentUser?.let { user ->
            when (user.role) {
                "Topógrafo" -> showUserTerrains(user.id)
                "Supervisor" -> showTeamTerrains()
                "Administrador" -> showAllTerrains()
                else -> Toast.makeText(this, "Sin permisos para ver terrenos", Toast.LENGTH_SHORT).show()
            }
        } ?: run {
            Toast.makeText(this, "Usuario no cargado", Toast.LENGTH_SHORT).show()
        }
    }

    private fun showUserTerrains(userId: String) {
        Log.d("MainActivity", "Buscando terrenos para usuario: $userId")

        database.reference.child("terrains")
            .orderByChild("createdBy")
            .equalTo(userId)
            .addListenerForSingleValueEvent(object : ValueEventListener {
                override fun onDataChange(snapshot: DataSnapshot) {
                    val terrains = mutableListOf<Terrain>()
                    for (terrainSnapshot in snapshot.children) {
                        val terrain = terrainSnapshot.getValue(Terrain::class.java)
                        if (terrain != null) {
                            terrains.add(terrain)
                        }
                    }
                    Log.d("MainActivity", "Terrenos encontrados: ${terrains.size}")
                    showTerrainsOnMap(terrains)
                }

                override fun onCancelled(error: DatabaseError) {
                    Log.e("MainActivity", "Error cargando terrenos: ${error.message}")
                    Toast.makeText(this@MainActivity, "Error cargando terrenos", Toast.LENGTH_SHORT).show()
                }
            })
    }

    private fun showTeamTerrains() {
        Log.d("MainActivity", "Supervisor viendo terrenos del equipo (mostrando todos)")
        showAllTerrains()
    }

    private fun showAllTerrains() {
        Log.d("MainActivity", "Cargando TODOS los terrenos del sistema")

        database.reference.child("terrains")
            .addListenerForSingleValueEvent(object : ValueEventListener {
                override fun onDataChange(snapshot: DataSnapshot) {
                    val terrains = mutableListOf<Terrain>()
                    for (terrainSnapshot in snapshot.children) {
                        val terrain = terrainSnapshot.getValue(Terrain::class.java)
                        if (terrain != null) {
                            terrains.add(terrain)
                        }
                    }
                    Log.d("MainActivity", "Total terrenos encontrados: ${terrains.size}")
                    showTerrainsOnMap(terrains)
                }

                override fun onCancelled(error: DatabaseError) {
                    Log.e("MainActivity", "Error cargando todos los terrenos: ${error.message}")
                    Toast.makeText(this@MainActivity, "Error cargando terrenos", Toast.LENGTH_SHORT).show()
                }
            })
    }

    private fun showTerrainsOnMap(terrains: List<Terrain>) {
        clearExistingTerrains()

        terrains.forEach { terrain ->
            if (terrain.points.isNotEmpty()) {
                val geoPoints = terrain.points.map { GeoPoint(it.latitude, it.longitude) }

                val polygon = Polygon().apply {
                    points = geoPoints
                    fillColor = Color.argb(30, 255, 0, 0)
                    strokeColor = Color.RED
                    strokeWidth = 2.0f
                    title = terrain.name
                }

                mapView.overlays.add(polygon)

                val centerPoint = geoPoints.first()
                val marker = Marker(mapView).apply {
                    position = centerPoint
                    setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                    title = terrain.name
                    snippet = "Área: ${String.format("%.2f", terrain.area)} m²"
                }

                terrainMarkers.add(marker)
                mapView.overlays.add(marker)
            }
        }

        if (terrains.isNotEmpty() && terrains.first().points.isNotEmpty()) {
            val firstPoint = terrains.first().points.first()
            mapView.controller.setCenter(GeoPoint(firstPoint.latitude, firstPoint.longitude))
            mapView.controller.setZoom(15.0)
        }

        mapView.invalidate()
    }

    private fun clearExistingTerrains() {
        val overlaysToRemove = mapView.overlays.filter {
            it is Polygon || terrainMarkers.contains(it)
        }
        overlaysToRemove.forEach { mapView.overlays.remove(it) }
        terrainMarkers.clear()
    }

    private fun setupMap() {
        try {
            mapView = findViewById(R.id.mapView)

            Configuration.getInstance().userAgentValue = packageName

            mapView.setTileSource(TileSourceFactory.MAPNIK)
            mapView.setMultiTouchControls(true)
            mapView.controller.setZoom(15.0)
            mapView.controller.setCenter(GeoPoint(-2.1894, -79.8890))

            val mapEventsReceiver = object : MapEventsReceiver {
                override fun singleTapConfirmedHelper(p: GeoPoint?): Boolean {
                    p?.let { addPointToTerrain(it) }
                    return true
                }

                override fun longPressHelper(p: GeoPoint?): Boolean {
                    return false
                }
            }

            mapView.overlays.add(MapEventsOverlay(mapEventsReceiver))

        } catch (e: Exception) {
            Log.e("MainActivity", "Error configurando mapa: ${e.message}")
            Toast.makeText(this, "Error configurando mapa", Toast.LENGTH_LONG).show()
        }
    }

    private fun addPointToTerrain(point: GeoPoint) {
        try {
            terrainPoints.add(point)

            val marker = Marker(mapView).apply {
                position = point
                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                title = "Punto ${terrainPoints.size}"
                snippet = "Lat: ${String.format("%.6f", point.latitude)}, Lon: ${String.format("%.6f", point.longitude)}"
            }

            mapView.overlays.add(marker)
            updatePolygon()
            mapView.invalidate()

            Toast.makeText(this, "Punto ${terrainPoints.size} agregado", Toast.LENGTH_SHORT).show()

        } catch (e: Exception) {
            Log.e("MainActivity", "Error agregando punto: ${e.message}")
            Toast.makeText(this, "Error agregando punto", Toast.LENGTH_SHORT).show()
        }
    }

    private fun updatePolygon() {
        try {
            currentPolygon?.let { mapView.overlays.remove(it) }

            if (terrainPoints.size >= 2) {
                currentPolygon = Polygon().apply {
                    points = terrainPoints
                    fillColor = Color.argb(50, 0, 0, 255)
                    strokeColor = Color.BLUE
                    strokeWidth = 3.0f
                }

                mapView.overlays.add(currentPolygon)

                if (terrainPoints.size >= 3) {
                    val area = calculateArea()
                    Log.d("MainActivity", "Área actual: ${String.format("%.2f", area)} m²")
                }
            }
        } catch (e: Exception) {
            Log.e("MainActivity", "Error actualizando polígono: ${e.message}")
        }
    }

    private fun clearTerrain() {
        try {
            terrainPoints.clear()
            currentPolygon?.let { mapView.overlays.remove(it) }
            currentPolygon = null

            val markersToRemove = mapView.overlays.filter { it is Marker && !companionMarkers.containsValue(it) && it != myLocationMarker }
            markersToRemove.forEach { mapView.overlays.remove(it) }

            mapView.invalidate()
            Toast.makeText(this, "Puntos del terreno limpiados", Toast.LENGTH_SHORT).show()

        } catch (e: Exception) {
            Log.e("MainActivity", "Error limpiando terreno: ${e.message}")
            Toast.makeText(this, "Error limpiando terreno", Toast.LENGTH_SHORT).show()
        }
    }

    private fun saveTerrain() {
        try {
            if (terrainPoints.size < 3) {
                Toast.makeText(this, "Se necesitan al menos 3 puntos para crear un terreno", Toast.LENGTH_LONG).show()
                return
            }

            val terrainId = UUID.randomUUID().toString()
            val locationDataPoints = terrainPoints.map { LocationData(it.latitude, it.longitude) }
            val area = calculateArea()

            val terrain = Terrain(
                id = terrainId,
                name = "Terreno ${Date()}",
                points = locationDataPoints,
                area = area,
                createdBy = auth.currentUser?.uid ?: "",
                createdAt = System.currentTimeMillis()
            )

            database.reference.child("terrains").child(terrainId)
                .setValue(terrain)
                .addOnSuccessListener {
                    Toast.makeText(this, "Terreno guardado exitosamente\nÁrea: ${String.format("%.2f", area)} m²", Toast.LENGTH_LONG).show()
                    clearTerrain()
                }
                .addOnFailureListener { error ->
                    Toast.makeText(this, "Error guardando terreno: ${error.message}", Toast.LENGTH_LONG).show()
                }

        } catch (e: Exception) {
            Log.e("MainActivity", "Error en saveTerrain: ${e.message}")
            Toast.makeText(this, "Error: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun calculateArea(): Double {
        if (terrainPoints.size < 3) return 0.0

        var area = 0.0
        val n = terrainPoints.size

        for (i in 0 until n) {
            val j = (i + 1) % n
            area += terrainPoints[i].longitude * terrainPoints[j].latitude
            area -= terrainPoints[j].longitude * terrainPoints[i].latitude
        }

        return Math.abs(area) / 2.0 * 111320 * 111320
    }

    private fun showLogoutDialog() {
        AlertDialog.Builder(this)
            .setTitle("Cerrar Sesión")
            .setMessage("¿Estás seguro de que quieres cerrar sesión?")
            .setPositiveButton("Sí") { _, _ -> logout() }
            .setNegativeButton("No", null)
            .show()
    }

    private fun logout() {
        try {
            if (isTrackingLocation) {
                stopLocationTracking()
            }

            setUserActiveStatus(false)
            auth.signOut()
            startActivity(Intent(this, LoginActivity::class.java))
            finish()

        } catch (e: Exception) {
            Log.e("MainActivity", "Error en logout: ${e.message}")
            Toast.makeText(this, "Error cerrando sesión", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onResume() {
        super.onResume()
        try {
            mapView.onResume()
            setUserActiveStatus(true)
        } catch (e: Exception) {
            Log.e("MainActivity", "Error en onResume: ${e.message}", e)
        }
    }

    override fun onPause() {
        super.onPause()
        try {
            mapView.onPause()
            setUserActiveStatus(false)
        } catch (e: Exception) {
            Log.e("MainActivity", "Error en onPause: ${e.message}", e)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            if (isTrackingLocation) {
                stopLocationTracking()
            }
        } catch (e: Exception) {
            Log.e("MainActivity", "Error en onDestroy: ${e.message}", e)
        }
    }


    private fun setUserActiveStatus(isActive: Boolean) {
        val userId = auth.currentUser?.uid ?: return
        val userRef = database.reference.child("users").child(userId)

        if (isActive) {
            // Usuario activo - actualizar timestamp
            val updates = mapOf(
                "active" to System.currentTimeMillis(),
                "isOnline" to true
            )
            userRef.updateChildren(updates)
        } else {
            // Usuario inactivo - mantener última actividad pero marcar como offline
            val updates = mapOf(
                "lastActivity" to System.currentTimeMillis(),
                "isOnline" to false
            )
            userRef.updateChildren(updates)
            // Remover el campo active para indicar que no está en línea
            userRef.child("active").removeValue()
        }
    }

}

