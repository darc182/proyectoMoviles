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

class LoginActivity : AppCompatActivity() {
    private lateinit var auth: FirebaseAuth

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        try {
            setContentView(R.layout.activity_login)

            auth = FirebaseAuth.getInstance()

            // Verificar si ya está logueado
            if (auth.currentUser != null) {
                startActivity(Intent(this, MainActivity::class.java))
                finish()
                return
            }

            setupViews()

        } catch (e: Exception) {
            Log.e("LoginActivity", "Error en onCreate: ${e.message}", e)
            Toast.makeText(this, "Error al inicializar: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun setupViews() {
        val etEmail = findViewById<EditText>(R.id.etEmail)
        val etPassword = findViewById<EditText>(R.id.etPassword)
        val btnLogin = findViewById<Button>(R.id.btnLogin)
        val tvGoToRegister = findViewById<TextView>(R.id.tvGoToRegister)

        btnLogin.setOnClickListener {
            val email = etEmail.text.toString().trim()
            val password = etPassword.text.toString().trim()

            if (email.isNotEmpty() && password.isNotEmpty()) {
                loginUser(email, password)
            } else {
                Toast.makeText(this, "Ingresa email y contraseña", Toast.LENGTH_SHORT).show()
            }
        }

        tvGoToRegister.setOnClickListener {
            startActivity(Intent(this, RegisterActivity::class.java))
        }
    }

    private fun loginUser(email: String, password: String) {
        try {
            auth.signInWithEmailAndPassword(email, password)
                .addOnCompleteListener { task ->
                    if (task.isSuccessful) {
                        // Verificar si el usuario existe en la base de datos
                        val userId = auth.currentUser?.uid ?: return@addOnCompleteListener

                        FirebaseDatabase.getInstance().reference.child("users").child(userId)
                            .addListenerForSingleValueEvent(object : ValueEventListener {
                                override fun onDataChange(snapshot: DataSnapshot) {
                                    if (snapshot.exists()) {
                                        // Usuario válido, continuar
                                        Toast.makeText(this@LoginActivity, "Login exitoso", Toast.LENGTH_SHORT).show()
                                        startActivity(Intent(this@LoginActivity, MainActivity::class.java))
                                        finish()
                                    } else {
                                        // Usuario eliminado
                                        Toast.makeText(this@LoginActivity, "Tu cuenta ha sido eliminada. Contacta al administrador.", Toast.LENGTH_LONG).show()
                                        auth.signOut()
                                    }
                                }

                                override fun onCancelled(error: DatabaseError) {
                                    Toast.makeText(this@LoginActivity, "Error verificando cuenta: ${error.message}", Toast.LENGTH_LONG).show()
                                    auth.signOut()
                                }
                            })
                    } else {
                        val error = task.exception?.message ?: "Error desconocido"
                        Toast.makeText(this, "Error: $error", Toast.LENGTH_LONG).show()
                        Log.e("LoginActivity", "Error login: $error")
                    }
                }
        } catch (e: Exception) {
            Log.e("LoginActivity", "Error en loginUser: ${e.message}", e)
            Toast.makeText(this, "Error: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }
}