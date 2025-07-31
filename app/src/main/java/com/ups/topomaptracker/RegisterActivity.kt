package com.ups.topomaptracker

import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.database.DataSnapshot
import com.google.firebase.database.DatabaseError
import com.google.firebase.database.FirebaseDatabase
import com.google.firebase.database.ValueEventListener
import com.ups.topomaptracker.models.User

class RegisterActivity : AppCompatActivity() {
    private lateinit var auth: FirebaseAuth
    private lateinit var database: FirebaseDatabase
    private var currentUserRole: String? = null
    private var isUserLoggedIn = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_register)

        auth = FirebaseAuth.getInstance()
        database = FirebaseDatabase.getInstance()

        // Verificar si hay un usuario logueado
        checkCurrentUser()
        setupViews()
    }

    private fun checkCurrentUser() {
        val currentUser = auth.currentUser
        if (currentUser != null) {
            isUserLoggedIn = true
            // Obtener rol del usuario actual
            database.reference.child("users").child(currentUser.uid)
                .addListenerForSingleValueEvent(object : ValueEventListener {
                    override fun onDataChange(snapshot: DataSnapshot) {
                        val user = snapshot.getValue(User::class.java)
                        currentUserRole = user?.role
                        setupRoleSpinner()
                    }
                    override fun onCancelled(error: DatabaseError) {
                        Log.e("RegisterActivity", "Error obteniendo rol: ${error.message}")
                    }
                })
        } else {
            isUserLoggedIn = false
            setupRoleSpinner()
        }
    }

    private fun setupViews() {
        val etName = findViewById<EditText>(R.id.etName)
        val etEmail = findViewById<EditText>(R.id.etEmail)
        val etPassword = findViewById<EditText>(R.id.etPassword)
        val btnRegister = findViewById<Button>(R.id.btnRegister)
        val btnBackToLogin = findViewById<Button>(R.id.btnBackToLogin)

        btnRegister.setOnClickListener {
            val name = etName.text.toString().trim()
            val email = etEmail.text.toString().trim()
            val password = etPassword.text.toString().trim()
            val spRole = findViewById<Spinner>(R.id.spRole)
            val role = spRole.selectedItem.toString()

            if (name.isNotEmpty() && email.isNotEmpty() && password.isNotEmpty()) {
                if (validateRolePermission(role)) {
                    registerUser(name, email, password, role)
                } else {
                    Toast.makeText(this, "No tienes permisos para crear este tipo de usuario", Toast.LENGTH_LONG).show()
                }
            } else {
                Toast.makeText(this, "Completa todos los campos", Toast.LENGTH_SHORT).show()
            }
        }

        btnBackToLogin?.setOnClickListener {
            if (isUserLoggedIn) {
                // Si hay un usuario logueado, volver al MainActivity
                startActivity(Intent(this, MainActivity::class.java))
            } else {
                // Si no hay usuario logueado, volver al LoginActivity
                startActivity(Intent(this, LoginActivity::class.java))
            }
            finish()
        }
    }

    private fun setupRoleSpinner() {
        val spRole = findViewById<Spinner>(R.id.spRole)
        val roles = getAvailableRoles()

        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, roles)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spRole.adapter = adapter
    }

    private fun getAvailableRoles(): Array<String> {
        return when {
            !isUserLoggedIn -> {
                // Primer registro (sin usuario logueado) - solo Topógrafo
                arrayOf("Topógrafo")
            }
            currentUserRole == "Administrador" -> {
                // Administrador puede crear cualquier rol
                arrayOf("Topógrafo", "Supervisor", "Administrador")
            }
            currentUserRole == "Supervisor" -> {
                // Supervisor solo puede crear Topógrafos
                arrayOf("Topógrafo")
            }
            else -> {
                // Otros roles solo pueden crear Topógrafos
                arrayOf("Topógrafo")
            }
        }
    }

    private fun validateRolePermission(roleToCreate: String): Boolean {
        return when {
            !isUserLoggedIn -> {
                // Primer registro - solo Topógrafo permitido
                roleToCreate == "Topógrafo"
            }
            currentUserRole == "Administrador" -> {
                // Administrador puede crear cualquier rol
                true
            }
            currentUserRole == "Supervisor" -> {
                // Supervisor solo puede crear Topógrafos
                roleToCreate == "Topógrafo"
            }
            else -> {
                // Otros roles solo pueden crear Topógrafos
                roleToCreate == "Topógrafo"
            }
        }
    }

    private fun registerUser(name: String, email: String, password: String, role: String) {
        // Validación adicional en el servidor
        if (!validateRolePermission(role)) {
            Toast.makeText(this, "Error: No tienes permisos para este rol", Toast.LENGTH_LONG).show()
            return
        }

        auth.createUserWithEmailAndPassword(email, password)
            .addOnCompleteListener { task ->
                if (task.isSuccessful) {
                    val userId = auth.currentUser?.uid ?: return@addOnCompleteListener

                    val user = User(
                        id = userId,
                        name = name,
                        email = email,
                        role = role,
                        isOnline = false,
                        active = 0L,
                        lastActivity = System.currentTimeMillis(),
                        createdBy = if (isUserLoggedIn) auth.currentUser?.uid else null,
                        createdAt = System.currentTimeMillis()
                    )

                    database.reference.child("users").child(userId).setValue(user)
                        .addOnSuccessListener {
                            Toast.makeText(this, "Usuario $role registrado exitosamente", Toast.LENGTH_SHORT).show()

                            if (isUserLoggedIn) {
                                // Volver al MainActivity si había un usuario logueado
                                startActivity(Intent(this, MainActivity::class.java))
                            } else {
                                // Ir al MainActivity si es el primer registro
                                startActivity(Intent(this, MainActivity::class.java))
                            }
                            finish()
                        }
                        .addOnFailureListener { error ->
                            Toast.makeText(this, "Error al guardar usuario: ${error.message}", Toast.LENGTH_LONG).show()
                        }
                } else {
                    Toast.makeText(this, "Error: ${task.exception?.message}", Toast.LENGTH_LONG).show()
                }
            }
    }
}