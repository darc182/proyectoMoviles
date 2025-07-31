package com.ups.topomaptracker.models

data class User(
    val id: String = "",
    val name: String = "",
    val email: String = "",
    val role: String = "Topógrafo",
    val isOnline: Boolean = false,
    val active: Long = 0L,
    val lastActivity: Long = 0L,
    val currentLocation: LocationData? = null,
    val createdBy: String? = null, // ID del usuario que creó este usuario
    val createdAt: Long = 0L,      // Timestamp de creación
    val modifiedBy: String? = null, // ID del último usuario que modificó
    val modifiedAt: Long = 0L       // Timestamp de última modificación
)

data class LocationData(
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val timestamp: Long = System.currentTimeMillis()
)