// auth.js
import { auth, database } from './firebase-config.js';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js';

// Variables globales
let currentUser = null;
let userRole = null;




// INICIALIZACIÓN
document.addEventListener('DOMContentLoaded', function() {
    console.log('Auth.js cargado');

    // Verificar si estamos en login.html o en el dashboard
    if (window.location.pathname.includes('login.html') || window.location.pathname.endsWith('/')) {
        initializeLogin();
    } else {
        initializeDashboard();
    }
});

// FUNCIÓN MODIFICADA: checkAuth con loading screen
async function checkAuth() {
    try {
        // Mostrar loading screen inmediatamente
        showLoadingScreen();

        return new Promise((resolve) => {
            const unsubscribe = onAuthStateChanged(auth, async (user) => {
                unsubscribe();

                if (!user) {
                    console.log('Usuario no autenticado, redirigiendo...');
                    // Pequeño delay para mostrar el loading
                    setTimeout(() => {
                        window.location.href = '/login.html';
                    }, 1000);
                    resolve(false);
                    return;
                }

                try {
                    // Verificar datos del usuario en Firebase
                    const userRef = ref(database, `users/${user.uid}`);
                    const snapshot = await get(userRef);

                    if (!snapshot.exists()) {
                        console.log('Datos de usuario no encontrados');
                        setTimeout(() => {
                            window.location.href = '/login.html';
                        }, 1000);
                        resolve(false);
                        return;
                    }

                    const userData = snapshot.val();

                    // Verificar si es admin
                    if (userData.role !== 'Administrador') {
                        console.log('Usuario sin permisos de administrador');
                        setTimeout(() => {
                            window.location.href = '/login.html';
                        }, 1000);
                        resolve(false);
                        return;
                    }

                    // Usuario válido - ocultar loading y mostrar dashboard
                    console.log('Usuario administrador autenticado');
                    hideLoadingScreen();
                    showDashboard();

                    // Inicializar el módulo si existe
                    if (typeof window.initializeDashboard === 'function') {
                        window.initializeDashboard();
                    }

                    resolve(true);

                } catch (error) {
                    console.error('Error verificando usuario:', error);
                    setTimeout(() => {
                        window.location.href = '/login.html';
                    }, 1000);
                    resolve(false);
                }
            });
        });

    } catch (error) {
        console.error('Error en checkAuth:', error);
        setTimeout(() => {
            window.location.href = '/login.html';
        }, 1000);
        return false;
    }
}

// FUNCIONES DE LOGIN
function initializeLogin() {
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');

    // Verificar si ya está autenticado
    onAuthStateChanged(auth, (user) => {
        if (user) {
            validateUserRole(user.uid);
        }
    });

    // Manejar envío del formulario
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value.trim();

        if (!email || !password) {
            showError('Por favor ingresa email y contraseña');
            return;
        }

        await loginUser(email, password);
    });

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        setTimeout(() => {
            errorMessage.style.display = 'none';
        }, 5000);
    }

    async function loginUser(email, password) {
        const loginBtn = document.querySelector('.login-btn');
        const originalText = loginBtn.textContent;

        try {
            // Mostrar loading
            loginBtn.textContent = 'Validando...';
            loginBtn.disabled = true;

            // Autenticar con Firebase
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            console.log('Usuario autenticado:', user.uid);

            // Validar rol del usuario
            await validateUserRole(user.uid);

        } catch (error) {
            console.error('Error de login:', error);

            let errorMsg = 'Error de autenticación';

            switch (error.code) {
                case 'auth/user-not-found':
                    errorMsg = 'Usuario no encontrado';
                    break;
                case 'auth/wrong-password':
                    errorMsg = 'Contraseña incorrecta';
                    break;
                case 'auth/invalid-email':
                    errorMsg = 'Email inválido';
                    break;
                case 'auth/too-many-requests':
                    errorMsg = 'Demasiados intentos. Intenta más tarde';
                    break;
                default:
                    errorMsg = error.message || 'Error desconocido';
            }

            showError(errorMsg);
        } finally {
            // Restaurar botón
            loginBtn.textContent = originalText;
            loginBtn.disabled = false;
        }
    }

    async function validateUserRole(userId) {
        try {
            console.log('Validando rol para usuario:', userId);

            const userRef = ref(database, `users/${userId}`);
            const snapshot = await get(userRef);

            if (snapshot.exists()) {
                const userData = snapshot.val();
                console.log('Datos del usuario:', userData);

                const role = userData.role;

                // Verificar si el rol permite acceso administrativo
                if (role === 'Administrador' || role === 'Supervisor') {
                    console.log('Acceso autorizado para rol:', role);

                    // Guardar datos en localStorage
                    localStorage.setItem('adminUser', JSON.stringify({
                        uid: userId,
                        name: userData.name,
                        email: userData.email,
                        role: role
                    }));

                    // Redirigir al dashboard
                    window.location.href = '/admin';
                } else {
                    console.log('Acceso denegado para rol:', role);
                    await signOut(auth);
                    showError(`Acceso denegado. Solo administradores y supervisores pueden acceder al panel. Tu rol: ${role}`);
                }
            } else {
                console.log('Usuario no encontrado en base de datos');
                await signOut(auth);
                showError('Usuario no encontrado en el sistema');
            }
        } catch (error) {
            console.error('Error validando rol:', error);
            await signOut(auth);
            showError('Error validando permisos: ' + error.message);
        }
    }
}

// FUNCIONES DEL DASHBOARD
function initializeDashboard() {
    console.log('Inicializando dashboard...');

    checkAuth();

    // Verificar autenticación al cargar el dashboard
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            console.log('Usuario autenticado en dashboard:', user.uid);
            await loadUserData(user.uid);
        } else {
            console.log('Usuario no autenticado, redirigiendo...');
            redirectToLogin();
        }
    });

    // También verificar datos en localStorage
    const storedUser = localStorage.getItem('adminUser');
    if (storedUser) {
        try {
            currentUser = JSON.parse(storedUser);
            userRole = currentUser.role;
            console.log('Usuario cargado desde localStorage:', currentUser);
            updateDashboardUI();
        } catch (error) {
            console.error('Error parsing stored user:', error);
            redirectToLogin();
        }
    }
}

async function loadUserData(userId) {
    try {
        const userRef = ref(database, `users/${userId}`);
        const snapshot = await get(userRef);

        if (snapshot.exists()) {
            const userData = snapshot.val();

            // Verificar rol nuevamente
            if (userData.role === 'Administrador' || userData.role === 'Supervisor') {
                currentUser = {
                    uid: userId,
                    name: userData.name,
                    email: userData.email,
                    role: userData.role
                };

                userRole = userData.role;

                // Actualizar localStorage
                localStorage.setItem('adminUser', JSON.stringify(currentUser));

                updateDashboardUI();

                console.log('Datos de usuario cargados:', currentUser);
            } else {
                console.log('Rol no autorizado:', userData.role);
                await logoutUser();
            }
        } else {
            console.log('Usuario no encontrado en base de datos');
            await logoutUser();
        }
    } catch (error) {
        console.error('Error cargando datos de usuario:', error);
        await logoutUser();
    }
}

function updateDashboardUI() {
    // Actualizar información del usuario en el header
    const userNameElement = document.querySelector('.user-name');
    const userRoleElement = document.querySelector('.user-role');

    if (userNameElement && currentUser) {
        userNameElement.textContent = currentUser.name;
    }

    if (userRoleElement && currentUser) {
        userRoleElement.textContent = currentUser.role;
    }

    // Configurar acceso basado en roles
    configureRoleAccess();

    // Configurar botón de logout
    const logoutBtn = document.querySelector('.logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logoutUser);
    }

    console.log('UI del dashboard actualizada');
}

function configureRoleAccess() {
    if (!userRole) return;

    // Configurar acceso basado en el rol
    const restrictedElements = document.querySelectorAll('[data-role-required]');

    restrictedElements.forEach(element => {
        const requiredRole = element.getAttribute('data-role-required');

        if (requiredRole === 'Administrador' && userRole !== 'Administrador') {
            element.style.display = 'none';
        }
    });

    console.log('Acceso configurado para rol:', userRole);
}

// FUNCIÓN DE LOGOUT
async function logoutUser() {
    try {
        await signOut(auth);
        localStorage.removeItem('adminUser');
        currentUser = null;
        userRole = null;

        console.log('Usuario deslogueado');
        redirectToLogin();
    } catch (error) {
        console.error('Error en logout:', error);
        // Forzar limpieza local aunque falle Firebase
        localStorage.removeItem('adminUser');
        redirectToLogin();
    }
}

function redirectToLogin() {
    if (!window.location.pathname.includes('login.html')) {
        window.location.href = '/';
    }
}

// FUNCIONES HELPER
function getCurrentUser() {
    return currentUser;
}

function getUserRole() {
    return userRole;
}

function isAdmin() {
    return userRole === 'Administrador';
}

function isSupervisor() {
    return userRole === 'Supervisor';
}

function hasAdminAccess() {
    return userRole === 'Administrador' || userRole === 'Supervisor';
}


// NUEVAS FUNCIONES: Control del loading screen
function showLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    const dashboardContainer = document.querySelector('.dashboard-container');

    if (loadingScreen) {
        loadingScreen.classList.remove('hidden');
    }
    if (dashboardContainer) {
        dashboardContainer.classList.remove('show');
    }
}

function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');

    if (loadingScreen) {
        setTimeout(() => {
            loadingScreen.classList.add('hidden');
        }, 500);
    }
}

function showDashboard() {
    const dashboardContainer = document.querySelector('.dashboard-container');

    if (dashboardContainer) {
        setTimeout(() => {
            dashboardContainer.classList.add('show');
        }, 300);
    }
}

// Hacer funciones globales
window.showLoadingScreen = showLoadingScreen;
window.hideLoadingScreen = hideLoadingScreen;
window.showDashboard = showDashboard;

// EXPORTAR FUNCIONES PARA USO EN OTROS MÓDULOS
window.authModule = {
    getCurrentUser,
    getUserRole,
    isAdmin,
    isSupervisor,
    hasAdminAccess,
    logoutUser
};

console.log('Módulo de autenticación cargado');