package com.ups.topomaptracker.models



data class Terrain(
    val id: String = "",
    val name: String = "",
    val points: List<LocationData> = emptyList(),
    val area: Double = 0.0,
    val createdBy: String = "",
    val createdAt: Long = System.currentTimeMillis()
)