// Importar Firebase correctamente
import { auth, database } from './firebase-config.js';
import { deleteUser } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';
import {
    ref,
    get,
    onValue,
    off,
    query,
    orderByChild,
    limitToLast,
    update,
    remove
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js';
import { verifyUserExists, startPeriodicCheck } from './auth-check.js';

// Variables globales (remover redeclaración de database)
let adminMap = null;
let userMarkers = {};
let currentListeners = [];
let terrainChart = null;
let roleChart = null;
let currentSection = 'dashboard';



// INICIALIZACIÓN PRINCIPAL
document.addEventListener('DOMContentLoaded', function() {
    console.log('Dashboard cargado');

    // Esperar a que auth esté disponible
    setTimeout(() => {
        if (window.authModule && window.authModule.hasAdminAccess()) {
            initializeDashboard();
        } else {
            console.log('Esperando autenticación...');
            // Reintentar después de un momento
            setTimeout(() => {
                if (window.authModule && window.authModule.hasAdminAccess()) {
                    initializeDashboard();
                } else {
                    window.location.href = 'login.html';
                }
            }, 2000);
        }
    }, 1000);
});

function initializeDashboard() {
    console.log('Inicializando dashboard administrativo...');

    try {



            setupNavigation();
            initializeMap();
            loadDashboardData();
            setupRealTimeUpdates();
            setupEventListeners();

        // Mostrar sección inicial
        showSection('dashboard');

        console.log('Dashboard inicializado correctamente');

    } catch (error) {
        console.error('Error inicializando dashboard:', error);
        showNotification('Error inicializando dashboard', 'error');
    }
}


// ==================== NAVEGACIÓN ====================
function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();

            // Remover clase active de todos los links
            navLinks.forEach(l => l.classList.remove('active'));

            // Agregar clase active al link clickeado
            link.classList.add('active');

            // Obtener la sección objetivo desde data-section o desde el texto del enlace
            let targetSection = link.getAttribute('data-section');

            // Si no existe data-section, inferir desde el texto o id
            if (!targetSection) {
                const linkText = link.textContent.trim().toLowerCase();
                if (linkText.includes('dashboard') || linkText.includes('panel')) {
                    targetSection = 'dashboard';
                } else if (linkText.includes('usuarios')) {
                    targetSection = 'users';
                } else if (linkText.includes('terrenos')) {
                    targetSection = 'terrains';
                } else if (linkText.includes('sesiones')) {
                    targetSection = 'sessions';
                } else if (linkText.includes('reportes')) {
                    targetSection = 'reports';
                }
            }

            if (targetSection) {
                showSection(targetSection);
            }
        });
    });

    // Mostrar dashboard por defecto
    showSection('dashboard');
}

// Función para limpiar gráficos al cambiar de sección
function cleanupCharts() {
    try {
        // Limpiar gráficos del dashboard
        if (typeof terrainChart !== 'undefined' && terrainChart) {
            terrainChart.destroy();
            terrainChart = null;
        }
        if (typeof roleChart !== 'undefined' && roleChart) {
            roleChart.destroy();
            roleChart = null;
        }

        // Limpiar gráficos de reportes
        if (window.rolesChartInstance) {
            window.rolesChartInstance.destroy();
            window.rolesChartInstance = null;
        }
        if (window.monthlyChartInstance) {
            window.monthlyChartInstance.destroy();
            window.monthlyChartInstance = null;
        }
        if (window.hourlyChartInstance) {
            window.hourlyChartInstance.destroy();
            window.hourlyChartInstance = null;
        }
    } catch (error) {
        console.warn('Error al limpiar gráficos:', error);
    }
}

// Función para limpiar listeners
function clearListeners() {
    // Limpiar intervalos si existen
    if (window.statsInterval) {
        clearInterval(window.statsInterval);
        window.statsInterval = null;
    }

    if (window.activityInterval) {
        clearInterval(window.activityInterval);
        window.activityInterval = null;
    }
}

// Configurar listeners específicos para cada sección
function setupSectionListeners() {
    // Solo agregar listeners si los elementos existen y no los tienen ya

    // Listeners para la sección de usuarios
    const userSearch = document.getElementById('user-search');
    const roleFilter = document.getElementById('role-filter');

    if (userSearch && !userSearch.hasAttribute('data-listener')) {
        userSearch.addEventListener('input', debounce(() => {
            if (typeof filterUsers === 'function') {
                filterUsers();
            }
        }, 300));
        userSearch.setAttribute('data-listener', 'true');
    }

    if (roleFilter && !roleFilter.hasAttribute('data-listener')) {
        roleFilter.addEventListener('change', () => {
            if (typeof filterUsers === 'function') {
                filterUsers();
            }
        });
        roleFilter.setAttribute('data-listener', 'true');
    }

    // Listeners para la sección de terrenos
    const terrainSearch = document.getElementById('terrain-search');
    const terrainCreatorFilter = document.getElementById('terrain-creator-filter');

    if (terrainSearch && !terrainSearch.hasAttribute('data-listener')) {
        terrainSearch.addEventListener('input', debounce(() => {
            if (typeof filterTerrains === 'function') {
                filterTerrains();
            }
        }, 300));
        terrainSearch.setAttribute('data-listener', 'true');
    }

    if (terrainCreatorFilter && !terrainCreatorFilter.hasAttribute('data-listener')) {
        terrainCreatorFilter.addEventListener('change', () => {
            if (typeof filterTerrains === 'function') {
                filterTerrains();
            }
        });
        terrainCreatorFilter.setAttribute('data-listener', 'true');
    }

    // Listeners para la sección de sesiones
    const refreshSessions = document.getElementById('refresh-sessions');

    if (refreshSessions && !refreshSessions.hasAttribute('data-listener')) {
        refreshSessions.addEventListener('click', () => {
            if (typeof loadSessions === 'function') {
                loadSessionsData();
            }
        });
        refreshSessions.setAttribute('data-listener', 'true');
    }

    // Listeners para la sección de reportes
    const exportReport = document.getElementById('export-report');
    const generateBackup = document.getElementById('generate-backup');

    if (exportReport && !exportReport.hasAttribute('data-listener')) {
        exportReport.addEventListener('click', () => {
            if (typeof exportReports === 'function') {
                exportReports();
            }
        });
        exportReport.setAttribute('data-listener', 'true');
    }

    if (generateBackup && !generateBackup.hasAttribute('data-listener')) {
        generateBackup.addEventListener('click', () => {
            if (typeof generateSystemBackup === 'function') {
                generateSystemBackup();
            }
        });
        generateBackup.setAttribute('data-listener', 'true');
    }
}

// Función auxiliar para debounce
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Función principal para mostrar secciones
function showSection(sectionName) {
    console.log(`Cambiando a sección: ${sectionName}`);

    // Limpiar gráficos antes de cambiar de sección
    cleanupCharts();

    // Ocultar todas las secciones
    const sections = document.querySelectorAll('.section, .admin-section');
    sections.forEach(section => {
        section.classList.remove('active');
        section.style.display = 'none';
    });

    // Mostrar la sección seleccionada
    const targetSection = document.getElementById(`${sectionName}-section`);
    if (targetSection) {
        targetSection.classList.add('active');
        targetSection.style.display = 'block';
    } else {
        console.error(`Sección no encontrada: ${sectionName}-section`);
        return;
    }

    // Actualizar variable global si existe
    if (typeof currentSection !== 'undefined') {
        currentSection = sectionName;
    }

    // Actualizar título de la página
    if (typeof updatePageTitle === 'function') {
        updatePageTitle(sectionName);
    }

    // Limpiar listeners anteriores
    clearListeners();

    // Configurar listeners para la nueva sección
    setupSectionListeners();

    // Actualizar navegación
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });

    const activeLink = document.querySelector(`.nav-link[data-section="${sectionName}"]`) ||
                      document.querySelector(`[onclick*="showSection('${sectionName}')"]`);
    if (activeLink) {
        activeLink.classList.add('active');
    }

    // Cargar contenido específico
    setTimeout(() => {
        try {
            switch (sectionName) {
                case 'dashboard':
                    if (typeof loadDashboardData === 'function') {
                        loadDashboardData();
                    }
                    break;
                case 'users':
                    if (typeof loadUsersData === 'function') {
                        loadUsersData();
                    }
                    break;
                case 'terrains':

                        loadTerrainsData();

                    break;
                case 'sessions':

                        loadSessionsData();

                    break;
                case 'reports':
                    if (typeof loadReportsData === 'function') {
                        loadReportsData();
                    }
                    break;
                default:
                    console.warn(`Sección no reconocida: ${sectionName}`);
            }
        } catch (error) {
            console.error('Error al cargar contenido de la sección:', error);
        }
    }, 100);
}



function updatePageTitle(section) {
    const titles = {
        'dashboard': { title: 'Dashboard', subtitle: 'Resumen general del sistema' },
        'users': { title: 'Gestión de Usuarios', subtitle: 'Administrar usuarios del sistema' },
        'terrains': { title: 'Gestión de Terrenos', subtitle: 'Administrar terrenos mapeados' },
        'sessions': { title: 'Sesiones Colaborativas', subtitle: 'Monitorear sesiones activas' },
        'reports': { title: 'Reportes y Análisis', subtitle: 'Análisis avanzado del sistema' }
    };

    const pageData = titles[section] || { title: 'Dashboard', subtitle: 'Panel administrativo' };

    const titleElement = document.getElementById('page-title');
    const subtitleElement = document.getElementById('page-subtitle');

    if (titleElement) titleElement.textContent = pageData.title;
    if (subtitleElement) subtitleElement.textContent = pageData.subtitle;
}

// ==================== MAPA ADMINISTRATIVO ====================
function initializeMap() {
    try {
        // Verificar que el elemento del mapa existe
        const mapElement = document.getElementById('admin-map');
        if (!mapElement) {
            console.error('Elemento admin-map no encontrado');
            return;
        }

        // Limpiar mapa existente si hay uno
        if (adminMap) {
            adminMap.remove();
            adminMap = null;
        }

        // Coordenadas de Ecuador (centro aproximado)
        const ecuadorCenter = [-1.831239, -78.183406];

        adminMap = L.map('admin-map').setView(ecuadorCenter, 6);

        // Agregar capa base
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 18
        }).addTo(adminMap);

        // Agregar controles
        adminMap.addControl(L.control.scale());

        console.log('Mapa administrativo inicializado');

        // Cargar ubicaciones de usuarios solo si database está disponible
        if (database) {
            loadUserLocations();
        }

    } catch (error) {
        console.error('Error inicializando mapa:', error);
        const mapElement = document.getElementById('admin-map');
        if (mapElement) {
            mapElement.innerHTML = '<div style="padding: 2rem; text-align: center; color: #666;">Error cargando mapa</div>';
        }
    }
}

function loadUserLocations() {
    const locationsRef = ref(database, 'user_locations');

    onValue(locationsRef, (snapshot) => {
        if (snapshot.exists()) {
            const locations = snapshot.val();
            updateMapMarkers(locations);
        }
    });
}

function updateMapMarkers(locations) {
    // Limpiar marcadores existentes
    Object.values(userMarkers).forEach(marker => {
        adminMap.removeLayer(marker);
    });
    userMarkers = {};

    // Agregar nuevos marcadores
    for (const [userId, location] of Object.entries(locations)) {
        if (location.latitude && location.longitude) {
            const marker = L.marker([location.latitude, location.longitude])
                .bindPopup(`
                    <div style="text-align: center;">
                        <strong>Usuario: ${userId}</strong><br>
                        <small>Última actualización: ${new Date(location.timestamp || Date.now()).toLocaleString()}</small>
                    </div>
                `)
                .addTo(adminMap);

            userMarkers[userId] = marker;
        }
    }
}

// ==================== CARGA DE DATOS ====================
function loadDashboardData() {
    loadStatistics();
    loadRecentActivity();
    loadCharts();
}

function loadSectionData(section) {
    switch (section) {
        case 'dashboard':
            loadDashboardData();
            break;
        case 'users':
            loadUsersData();
            break;
        case 'terrains':
            loadTerrainsData();
            break;
        case 'sessions':
            loadSessionsData();
            break;
        case 'reports':
            loadReportsData();
            break;
    }
}

async function loadStatistics() {
    try {
        // Cargar usuarios
        const usersSnapshot = await get(ref(database, 'users'));
        const usersData = usersSnapshot.val() || {};
        const totalUsers = Object.keys(usersData).length;



        // Cargar terrenos
        const terrainsSnapshot = await get(ref(database, 'terrains'));
        const terrainsData = terrainsSnapshot.val() || {};
        const totalTerrains = Object.keys(terrainsData).length;


        // Cargar sesiones activas
        const sessionsSnapshot = await get(ref(database, 'collaboration_sessions'));
        const sessionsData = sessionsSnapshot.val() || {};
        const activeSessions = Object.values(sessionsData)
            .filter(session => session.status === 'active').length;


        // Calcular área total
        let totalArea = 0;
        Object.values(terrainsData).forEach(terrain => {
            if (terrain.area) {
                totalArea += parseFloat(terrain.area);
            }
        });

        // Usuarios activos (últimas 24 horas)
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        const activeUsers = Object.values(usersData)
            .filter(user => user.active && user.active > oneDayAgo).length;

        // Actualizar elementos del DOM
        updateStatElement('total-users', totalUsers);
        updateStatElement('total-terrains', totalTerrains);
        updateStatElement('active-sessions', activeSessions);
        updateStatElement('total-area', `${totalArea.toFixed(2)} m²`);
        updateStatElement('active-users', activeUsers);

        // Actualizar header stats
        updateStatElement('header-users', totalUsers);
        updateStatElement('header-terrains', totalTerrains);
        updateStatElement('header-online', activeUsers);


    } catch (error) {
        console.error('Error cargando estadísticas:', error);
        showNotification('Error cargando estadísticas', 'error');
    }
}

function updateStatElement(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = value;
    }
}

async function loadRecentActivity() {
    try {
        const activityContainer = document.getElementById('recent-activity');
        if (!activityContainer) return;

        // Simular actividad reciente combinando datos de terrenos y sesiones
        const terrainsSnapshot = await get(ref(database, 'terrains'));
        const sessionsSnapshot = await get(ref(database, 'collaboration_sessions'));
        const usersSnapshot = await get(ref(database, 'users'));

        const terrainsData = terrainsSnapshot.val() || {};
        const sessionsData = sessionsSnapshot.val() || {};
        const usersData = usersSnapshot.val() || {};

        const activities = [];

        // Agregar terrenos recientes
        Object.entries(terrainsData)
            .sort(([,a], [,b]) => (b.createdAt || 0) - (a.createdAt || 0))
            .slice(0, 3)
            .forEach(([id, terrain]) => {
                const userName = usersData[terrain.createdBy]?.name || 'Usuario desconocido';
                activities.push({
                    type: 'terrain',
                    message: `${userName} creó el terreno "${terrain.name}"`,
                    time: terrain.createdAt || Date.now(),
                    icon: '🗺️'
                });
            });

        // Agregar sesiones recientes
        Object.entries(sessionsData)
            .sort(([,a], [,b]) => (b.createdAt || 0) - (a.createdAt || 0))
            .slice(0, 2)
            .forEach(([id, session]) => {
                const hostName = usersData[session.hostId]?.name || 'Usuario desconocido';
                activities.push({
                    type: 'session',
                    message: `${hostName} inició una sesión colaborativa`,
                    time: session.createdAt || Date.now(),
                    icon: '🤝'
                });
            });

        // Ordenar por tiempo y mostrar las más recientes
        activities.sort((a, b) => b.time - a.time);

        const activityHTML = activities.slice(0, 5).map(activity => `
            <div class="activity-item">
                <div class="activity-icon ${activity.type}">
                    ${activity.icon}
                </div>
                <div class="activity-content">
                    <div class="activity-message">${activity.message}</div>
                    <div class="activity-meta">${timeAgo(activity.time)}</div>
                </div>
            </div>
        `).join('');

        activityContainer.innerHTML = activityHTML ||
            '<div class="no-data">No hay actividad reciente</div>';

    } catch (error) {
        console.error('Error cargando actividad reciente:', error);
        const activityContainer = document.getElementById('recent-activity');
        if (activityContainer) {
            activityContainer.innerHTML = '<div class="no-data">Error cargando actividad</div>';
        }
    }
}

async function loadCharts() {
    try {
        await loadTerrainChart();
        await loadRoleChart();
    } catch (error) {
        console.error('Error cargando gráficos:', error);
    }
}

async function loadTerrainChart() {
    try {
        const terrainsSnapshot = await get(ref(database, 'terrains'));
        const terrainsData = terrainsSnapshot.val() || {};

        // Agrupar terrenos por mes
        const monthlyData = {};
        Object.values(terrainsData).forEach(terrain => {
            const date = new Date(terrain.createdAt || Date.now());
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            monthlyData[monthKey] = (monthlyData[monthKey] || 0) + 1;
        });

        // Obtener últimos 6 meses
        const months = [];
        const values = [];
        const now = new Date();

        for (let i = 5; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const monthName = date.toLocaleDateString('es', { month: 'short', year: '2-digit' });

            months.push(monthName);
            values.push(monthlyData[monthKey] || 0);
        }

        const ctx = document.getElementById('terrain-chart');
        if (!ctx) return;

        if (terrainChart) {
            terrainChart.destroy();
        }

        terrainChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: months,
                datasets: [{
                    label: 'Terrenos Creados',
                    data: values,
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });

    } catch (error) {
        console.error('Error cargando gráfico de terrenos:', error);
    }
}

async function loadRoleChart() {
    try {
        const usersSnapshot = await get(ref(database, 'users'));
        const usersData = usersSnapshot.val() || {};

        // Contar usuarios por rol
        const roleCounts = {};
        Object.values(usersData).forEach(user => {
            const role = user.role || 'Sin rol';
            roleCounts[role] = (roleCounts[role] || 0) + 1;
        });

        const ctx = document.getElementById('role-chart');
        if (!ctx) return;

        // Destruir gráfico anterior si existe
        if (window.roleChart) {
            window.roleChart.destroy();
        }

        const labels = Object.keys(roleCounts);
        const data = Object.values(roleCounts);
        const colors = ['#e74c3c', '#3498db', '#27ae60', '#f39c12', '#9b59b6'];

        window.roleChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors.slice(0, labels.length),
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 15,
                            font: {
                                size: 12
                            }
                        }
                    }
                }
            }
        });

    } catch (error) {
        console.error('Error cargando gráfico de roles:', error);
        const container = document.getElementById('role-chart').parentElement;
        container.innerHTML = '<div class="no-data">Error cargando datos de roles</div>';
    }
}


// ==================== GESTIÓN DE USUARIOS ====================
async function loadUsersData() {
    try {
        const usersSnapshot = await get(ref(database, 'users'));
        const usersData = usersSnapshot.val() || {};


        const tbody = document.getElementById('users-tbody');
        if (!tbody) return;

        if (Object.keys(usersData).length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="no-data">No hay usuarios registrados</td></tr>';
            return;
        }


        const usersHTML = Object.entries(usersData).map(([userId, user]) => {

            // Determinar última actividad
                let lastActivity = 'Nunca';
                let isOnline = false;

             if (user.active && user.active > 0) {
                    // Usuario actualmente activo
                    lastActivity = timeAgo(user.active);
                    isOnline = (Date.now() - user.active < 5 * 60 * 1000); // 5 minutos
                } else if (user.lastActivity && user.lastActivity > 0) {
                    // Usuario con última actividad registrada
                    lastActivity = timeAgo(user.lastActivity);
                    isOnline = false;
                }

            const statusClass = isOnline ? 'status-active' : 'status-inactive';
            const statusText = isOnline ? 'En línea' : 'Desconectado';

            const actionsHTML = window.authModule.isAdmin() ? `
                <div class="action-buttons ">
                    <button class="action-btn btn-view" onclick="viewUserDetails('${userId}')">
                        👁️ Ver
                    </button>
                    <button class="action-btn btn-edit" onclick="editUser('${userId}')">
                        ✏️ Editar
                    </button>
                </div>
            ` : 'Sin permisos';

            return `
                <tr>
                    <td>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div class="user-avatar" style="width: 35px; height: 35px; font-size: 14px;">
                                ${(user.name || 'U').charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <strong>${user.name || 'Sin nombre'}</strong>
                            </div>
                        </div>
                    </td>
                    <td>${user.email || 'Sin email'}</td>
                    <td>
                        <span class="role-badge role-${(user.role || 'sin-rol').toLowerCase().replace('ó', 'o')}">
                            ${user.role || 'Sin rol'}
                        </span>
                    </td>
                    <td>
                        <span class="status-badge ${statusClass}">
                            ${statusText}
                        </span>
                    </td>
                    <td>${lastActivity}</td>
                    <td>${actionsHTML}</td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = usersHTML;

        // Configurar filtros de búsqueda
        setupUserFilters(usersData);

    } catch (error) {
        console.error('Error cargando usuarios:', error);
        const tbody = document.getElementById('users-tbody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" class="no-data">Error cargando usuarios</td></tr>';
        }
    }
}

function setupUserFilters(usersData) {
    const searchInput = document.getElementById('user-search');
    const roleFilter = document.getElementById('role-filter');

    if (searchInput) {
        searchInput.addEventListener('input', () => filterUsers(usersData));
    }

    if (roleFilter) {
        roleFilter.addEventListener('change', () => filterUsers(usersData));
    }
}

function filterUsers(usersData) {
    const searchTerm = document.getElementById('user-search')?.value.toLowerCase() || '';
    const roleFilter = document.getElementById('role-filter')?.value || '';

    const filteredUsers = Object.entries(usersData).filter(([userId, user]) => {
        const matchesSearch = !searchTerm ||
            (user.name && user.name.toLowerCase().includes(searchTerm)) ||
            (user.email && user.email.toLowerCase().includes(searchTerm));

        const matchesRole = !roleFilter || user.role === roleFilter;

        return matchesSearch && matchesRole;
    });

    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;

    if (filteredUsers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="no-data">No se encontraron usuarios</td></tr>';
        return;
    }

    // Regenerar HTML con usuarios filtrados
    const usersHTML = filteredUsers.map(([userId, user]) => {
        const lastActivity = user.lastActivity ? timeAgo(user.lastActivity) : 'Nunca';
        const isOnline = user.lastActivity && (Date.now() - user.lastActivity < 5 * 60 * 1000);
        const statusClass = isOnline ? 'status-active' : 'status-inactive';
        const statusText = isOnline ? 'En línea' : 'Desconectado';

        const actionsHTML = window.authModule.isAdmin() ? `
            <div class="action-buttons">
                <button class="action-btn btn-view" onclick="viewUserDetails('${userId}')">👁️ Ver</button>
                <button class="action-btn btn-edit" onclick="editUser('${userId}')">✏️ Editar</button>
            </div>
        ` : 'Sin permisos';

        return `
            <tr>
                <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div class="user-avatar" style="width: 35px; height: 35px; font-size: 14px;">
                            ${(user.name || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div><strong>${user.name || 'Sin nombre'}</strong></div>
                    </div>
                </td>
                <td>${user.email || 'Sin email'}</td>
                <td>
                    <span class="role-badge role-${(user.role || 'sin-rol').toLowerCase().replace('ó', 'o')}">
                        ${user.role || 'Sin rol'}
                    </span>
                </td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>${lastActivity}</td>
                <td>${actionsHTML}</td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = usersHTML;
}

// ==================== GESTIÓN DE TERRENOS ====================
async function loadTerrainsData() {
    try {
        const terrainsSnapshot = await get(ref(database, 'terrains'));
        const usersSnapshot = await get(ref(database, 'users'));

        const terrainsData = terrainsSnapshot.val() || {};
        const usersData = usersSnapshot.val() || {};

        const tbody = document.getElementById('terrains-tbody');
        if (!tbody) return;

        if (Object.keys(terrainsData).length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="no-data">No hay terrenos registrados</td></tr>';
            return;
        }

        const terrainsHTML = Object.entries(terrainsData).map(([terrainId, terrain]) => {
            // Lógica mejorada para determinar el creador
            let creatorName = 'Usuario desconocido';
            let isCollaborative = false;

            // Detectar si es colaborativo por el nombre o por el patrón del ID del creador
            if (terrain.name && terrain.name.toLowerCase().includes('colaborativo')) {
                isCollaborative = true;
                creatorName = 'Terreno Colaborativo';
            } else if (terrain.createdBy && terrain.createdBy.includes('-')) {
                // Si el createdBy es un UUID (contiene guiones), probablemente sea colaborativo
                isCollaborative = true;
                creatorName = 'Terreno Colaborativo';
            } else if (terrain.createdBy && usersData[terrain.createdBy]) {
                // Terreno individual con creador válido
                creatorName = usersData[terrain.createdBy].name || 'Usuario desconocido';
            } else if (terrain.createdBy) {
                // Terreno con createdBy pero usuario no encontrado
                creatorName = 'Usuario no encontrado';
            }

            console.log(terrain);
            const createdDate = terrain.createdAt ?
                new Date(terrain.createdAt).toLocaleDateString('es') : 'Fecha desconocida';

            const area = terrain.area ? `${terrain.area.toFixed(2)} m²` : 'N/A';
            const pointsCount = terrain.points ? terrain.points.length : 0;

            return `
                <tr>
                    <td>
                        <strong>${terrain.name || 'Sin nombre'}</strong>
                        <br>
                        <small style="color: #666;">${terrain.description || 'Sin descripción'}</small>
                        ${isCollaborative ?
                            '<br><span style="color: #3498db; font-size: 12px;">🤝 Colaborativo</span>' :
                            ''}
                    </td>
                    <td>${creatorName}</td>
                    <td>${area}</td>
                    <td>${pointsCount} puntos</td>
                    <td>${createdDate}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="action-btn btn-view" onclick="viewTerrainDetails('${terrainId}')">
                                👁️ Ver
                            </button>
                            <button class="action-btn btn-download" onclick="downloadTerrain('${terrainId}')">
                                📥 Descargar
                            </button>
                            <button class="action-btn btn-delete" onclick="confirmDeleteTerrain('${terrainId}', '${terrain.name || 'Sin nombre'}', ${isCollaborative})">
                                🗑️ Eliminar
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = terrainsHTML;

        // Configurar filtros
        setupTerrainFilters(terrainsData, usersData);

    } catch (error) {
        console.error('Error cargando terrenos:', error);
        const tbody = document.getElementById('terrains-tbody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" class="no-data">Error cargando terrenos</td></tr>';
        }
    }
}

function setupTerrainFilters(terrainsData, usersData) {
    const searchInput = document.getElementById('terrain-search');
    const creatorFilter = document.getElementById('terrain-creator-filter');

    // Llenar filtro de creadores
    if (creatorFilter) {
        const creators = [...new Set(Object.values(terrainsData)
            .filter(t => t.createdBy && !t.createdBy.includes('-'))
            .map(t => t.createdBy))];

        const hasCollaborative = Object.values(terrainsData).some(t =>
            (t.name && t.name.toLowerCase().includes('colaborativo')) ||
            (t.createdBy && t.createdBy.includes('-'))
        );

        let options = '<option value="">Todos los creadores</option>';

        if (hasCollaborative) {
            options += '<option value="collaborative">Terrenos Colaborativos</option>';
        }

        options += creators
            .filter(creatorId => usersData[creatorId])
            .map(creatorId => `<option value="${creatorId}">${usersData[creatorId].name}</option>`)
            .join('');

        creatorFilter.innerHTML = options;
    }

    if (searchInput) {
        searchInput.addEventListener('input', () => filterTerrains(terrainsData, usersData));
    }

    if (creatorFilter) {
        creatorFilter.addEventListener('change', () => filterTerrains(terrainsData, usersData));
    }
}


function filterTerrains(terrainsData, usersData) {
    const searchTerm = document.getElementById('terrain-search')?.value.toLowerCase() || '';
    const creatorFilter = document.getElementById('terrain-creator-filter')?.value || '';

    const filteredTerrains = Object.entries(terrainsData).filter(([terrainId, terrain]) => {
        const matchesSearch = !searchTerm ||
            (terrain.name && terrain.name.toLowerCase().includes(searchTerm)) ||
            (terrain.description && terrain.description.toLowerCase().includes(searchTerm));

        let matchesCreator = true;
        if (creatorFilter) {
            if (creatorFilter === 'collaborative') {
                // Filtro para terrenos colaborativos
                matchesCreator = (terrain.name && terrain.name.toLowerCase().includes('colaborativo')) ||
                                (terrain.createdBy && terrain.createdBy.includes('-'));
            } else {
                // Filtro por creador específico
                matchesCreator = terrain.createdBy === creatorFilter;
            }
        }

        return matchesSearch && matchesCreator;
    });

    const tbody = document.getElementById('terrains-tbody');
    if (!tbody) return;

    if (filteredTerrains.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="no-data">No se encontraron terrenos</td></tr>';
        return;
    }

    // Regenerar HTML con terrenos filtrados usando la misma lógica del creador
    const terrainsHTML = filteredTerrains.map(([terrainId, terrain]) => {
        let creatorName = 'Usuario desconocido';
        let isCollaborative = false;

        if (terrain.name && terrain.name.toLowerCase().includes('colaborativo')) {
            isCollaborative = true;
            creatorName = 'Terreno Colaborativo';
        } else if (terrain.createdBy && terrain.createdBy.includes('-')) {
            isCollaborative = true;
            creatorName = 'Terreno Colaborativo';
        } else if (terrain.createdBy && usersData[terrain.createdBy]) {
            creatorName = usersData[terrain.createdBy].name || 'Usuario desconocido';
        } else if (terrain.createdBy) {
            creatorName = 'Usuario no encontrado';
        }

        const createdDate = terrain.createdAt ?
            new Date(terrain.createdAt).toLocaleDateString('es') : 'Fecha desconocida';
        const area = terrain.area ? `${terrain.area.toFixed(2)} m²` : 'N/A';
        const pointsCount = terrain.points ? terrain.points.length : 0;

        return `
            <tr>
                <td>
                    <strong>${terrain.name || 'Sin nombre'}</strong>
                    <br>
                    <small style="color: #666;">${terrain.description || 'Sin descripción'}</small>
                    ${isCollaborative ?
                        '<br><span style="color: #3498db; font-size: 12px;">🤝 Colaborativo</span>' :
                        ''}
                </td>
                <td>${creatorName}</td>
                <td>${area}</td>
                <td>${pointsCount} puntos</td>
                <td>${createdDate}</td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn btn-view" onclick="viewTerrainDetails('${terrainId}')">
                            👁️ Ver
                        </button>
                        <button class="action-btn btn-download" onclick="downloadTerrain('${terrainId}')">
                            📥 Descargar
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = terrainsHTML;
}


// ==================== FUNCIONES PARA ELIMINAR TERRENOS ====================

function confirmDeleteTerrain(terrainId, terrainName, isCollaborative) {
    const collaborativeText = isCollaborative ?
        '\n\n⚠️ NOTA: Este es un terreno colaborativo. Al eliminarlo también se eliminarán:\n- La sesión colaborativa asociada\n- Todos los puntos de la sesión\n- El código de acceso' : '';

    if (confirm(`¿Estás seguro de que quieres ELIMINAR el terreno "${terrainName}"?${collaborativeText}\n\nEsta acción NO se puede deshacer.`)) {
        deleteTerrain(terrainId, isCollaborative);
    }
}

async function deleteTerrain(terrainId, isCollaborative) {
    try {
        showNotification('Eliminando terreno...', 'info');

        // Obtener datos del terreno antes de eliminarlo
        const terrainSnapshot = await get(ref(database, `terrains/${terrainId}`));

        if (!terrainSnapshot.exists()) {
            showNotification('El terreno no existe', 'error');
            return;
        }

        const terrainData = terrainSnapshot.val();



        // Si es colaborativo, eliminar también la sesión y datos relacionados
        if (isCollaborative && terrainData.createdBy) {
            const sessionId = terrainData.createdBy;

            // Obtener datos de la sesión
            const sessionSnapshot = await get(ref(database, `collaborative_sessions/${sessionId}`));

            if (sessionSnapshot.exists()) {
                const sessionData = sessionSnapshot.val();

                console.log(sessionData.code)
                // Eliminar código de sesión si existe
                if (sessionData.code) {
                    await remove(ref(database, `session_codes/${sessionData.code}`));
                }

                // Eliminar puntos de la sesión
                await remove(ref(database, `session_points/${sessionId}`));

                // Eliminar la sesión
                await remove(ref(database, `collaborative_sessions/${sessionId}`));

                console.log(`Sesión colaborativa ${sessionId} eliminada completamente`);
            }
        }

        // Eliminar el terreno
        await remove(ref(database, `terrains/${terrainId}`));

        console.log(`Terreno ${terrainId} eliminado exitosamente`);
        showNotification('Terreno eliminado exitosamente', 'success');

        // Recargar la tabla de terrenos
        await loadTerrainsData();

        // Actualizar estadísticas del dashboard si estamos en esa sección
        if (getCurrentSection() === 'dashboard') {
            loadStatistics();
        }

    } catch (error) {
        console.error('Error eliminando terreno:', error);
        showNotification('Error al eliminar el terreno', 'error');
    }
}


window.confirmDeleteTerrain = confirmDeleteTerrain;

// ==================== GESTIÓN DE SESIONES ====================
async function loadSessionsData() {
    try {
        const sessionsSnapshot = await get(ref(database, 'collaborative_sessions'));
        const usersSnapshot = await get(ref(database, 'users'));

        const sessionsData = sessionsSnapshot.val() || {};
        const usersData = usersSnapshot.val() || {};

        console.log('Sesiones cargadas:', sessionsData);

        // Separar sesiones activas y completadas
        const activeSessions = [];
        const completedSessions = [];

        Object.entries(sessionsData).forEach(([sessionId, session]) => {
            const sessionWithId = { ...session, id: sessionId };
            if (session.status === 'active' || session.status === 'waiting') {
                activeSessions.push(sessionWithId);
            } else {
                completedSessions.push(sessionWithId);
            }
        });

        // Mostrar sesiones activas
        displaySessions(activeSessions, usersData, 'active-sessions-list');

        // Mostrar sesiones completadas
        displaySessions(completedSessions, usersData, 'completed-sessions-list');

    } catch (error) {
        console.error('Error cargando sesiones:', error);
        const activeContainer = document.getElementById('active-sessions-list');
        const completedContainer = document.getElementById('completed-sessions-list');

        if (activeContainer) {
            activeContainer.innerHTML = '<div class="no-data">Error cargando sesiones</div>';
        }
        if (completedContainer) {
            completedContainer.innerHTML = '<div class="no-data">Error cargando sesiones</div>';
        }
    }
}

function displaySessions(sessions, usersData, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (sessions.length === 0) {
        container.innerHTML = '<div class="no-data">No hay sesiones</div>';
        return;
    }

    const sessionsHTML = sessions.map(session => {
        const hostName = usersData[session.hostId]?.name || 'Usuario desconocido';
        const participantsCount = session.participants ? Object.keys(session.participants).length : 0;
        const createdDate = session.createdAt ?
            new Date(session.createdAt).toLocaleDateString('es') : 'Fecha desconocida';

        const statusClass = {
            'active': 'active',
            'waiting': 'waiting',
            'completed': 'completed',
            'cancelled': 'completed'
        }[session.status] || 'completed';

        const statusText = {
            'active': 'Activa',
            'waiting': 'Esperando',
            'completed': 'Completada',
            'cancelled': 'Cancelada'
        }[session.status] || 'Desconocido';

        return `
            <div class="session-item">
                <div class="session-header">
                    <h4 class="session-title">${session.terrainName || 'Sesión sin nombre'}</h4>
                    <span class="session-status ${statusClass}">${statusText}</span>
                </div>
                <div class="session-details">
                    <p><strong>Anfitrión:</strong> ${hostName}</p>
                    <p><strong>Participantes:</strong> ${participantsCount}</p>
                    <p><strong>Fecha:</strong> ${createdDate}</p>
                    ${session.description ? `<p><strong>Descripción:</strong> ${session.description}</p>` : ''}
                </div>
                <div class="session-actions">
                    <button class="action-btn btn-view" onclick="viewSessionDetails('${session.id}')">
                        👁️ Ver Detalles
                    </button>
                    ${session.status === 'active' ? `
                        <button class="action-btn btn-edit" onclick="manageSession('${session.id}')">
                            ⚙️ Gestionar
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = sessionsHTML;
}

// ==================== REPORTES ====================
async function loadReportsData() {
    if (!window.authModule.isAdmin()) {
        const reportsSections = document.querySelectorAll('#reports-section .report-card');
        reportsSections.forEach(section => {
            section.innerHTML = '<div class="access-denied">Solo administradores pueden ver reportes</div>';
        });
        return;
    }

    try {
        await generateGeneralSummary();
        await generateRolesChart();
        await generateMonthlyChart();
        await generateHourlyChart();
    } catch (error) {
        console.error('Error cargando reportes:', error);
    }
}

async function generateGeneralSummary() {
    try {
        const usersSnapshot = await get(ref(database, 'users'));
        const terrainsSnapshot = await get(ref(database, 'terrains'));
        const sessionsSnapshot = await get(ref(database, 'collaboration_sessions'));

        const usersData = usersSnapshot.val() || {};
        const terrainsData = terrainsSnapshot.val() || {};
        const sessionsData = sessionsSnapshot.val() || {};

        // Calcular estadísticas
        const totalUsers = Object.keys(usersData).length;
        const totalTerrains = Object.keys(terrainsData).length;
        const totalSessions = Object.keys(sessionsData).length;

        // Calcular área total
        let totalArea = 0;
        Object.values(terrainsData).forEach(terrain => {
            if (terrain.area) totalArea += parseFloat(terrain.area);
        });

        // Usuarios activos última semana
        const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const activeUsersWeek = Object.values(usersData)
            .filter(user => user.lastActivity && user.lastActivity > weekAgo).length;

        // Terrenos creados este mes
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
        const terrainsThisMonth = Object.values(terrainsData)
            .filter(terrain => terrain.createdAt && terrain.createdAt > monthStart).length;

        const summaryHTML = `
            <div class="summary-stats">
                <div class="summary-stat">
                    <h4>${totalUsers}</h4>
                    <p>Total Usuarios</p>
                </div>
                <div class="summary-stat">
                    <h4>${totalTerrains}</h4>
                    <p>Total Terrenos</p>
                </div>
                <div class="summary-stat">
                    <h4>${totalArea.toFixed(2)} m²</h4>
                    <p>Área Total</p>
                </div>
                <div class="summary-stat">
                    <h4>${totalSessions}</h4>
                    <p>Total Sesiones</p>
                </div>
            </div>

            <div class="summary-insights">
                <h4>Insights</h4>
                <ul>
                    <li>Usuarios activos última semana: ${activeUsersWeek}</li>
                    <li>Terrenos creados este mes: ${terrainsThisMonth}</li>
                    <li>Promedio de área por terreno: ${totalTerrains > 0 ? (totalArea / totalTerrains).toFixed(2) : 0} m²</li>
                    <li>Tasa de actividad: ${totalUsers > 0 ? ((activeUsersWeek / totalUsers) * 100).toFixed(1) : 0}%</li>
                </ul>
            </div>
        `;

        const summaryContainer = document.getElementById('general-summary');
        if (summaryContainer) {
            summaryContainer.innerHTML = summaryHTML;
        }

    } catch (error) {
        console.error('Error generando resumen general:', error);
    }
}

async function generateRolesChart() {
    try {
        const usersSnapshot = await get(ref(database, 'users'));
        const usersData = usersSnapshot.val() || {};

        // Contar usuarios por rol
        const roleCounts = {};
        Object.values(usersData).forEach(user => {
            const role = user.role || 'Sin rol';
            roleCounts[role] = (roleCounts[role] || 0) + 1;
        });

        const ctx = document.getElementById('roles-chart');
        if (!ctx) return;

        // Destruir gráfico anterior si existe
        if (window.rolesChart) {
            window.rolesChart.destroy();
        }

        const labels = Object.keys(roleCounts);
        const data = Object.values(roleCounts);
        const colors = ['#e74c3c', '#3498db', '#27ae60', '#f39c12', '#9b59b6'];

        window.rolesChart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors.slice(0, labels.length),
                    borderWidth: 2,
                    borderColor: '#fff',
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 15,
                            font: {
                                size: 12
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((context.parsed / total) * 100).toFixed(1);
                                return `${context.label}: ${context.parsed} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });

    } catch (error) {
        console.error('Error generando gráfico de roles:', error);
        const container = document.getElementById('roles-chart').parentElement;
        container.innerHTML = '<div class="no-data">Error cargando datos de roles</div>';
    }
}

async function generateMonthlyChart() {
    try {
        const terrainsSnapshot = await get(ref(database, 'terrains'));
        const terrainsData = terrainsSnapshot.val() || {};

        // Obtener últimos 6 meses
        const monthsData = {};
        const now = new Date();

        // Inicializar últimos 6 meses con 0
        for (let i = 5; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthKey = date.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
            monthsData[monthKey] = 0;
        }

        // Contar terrenos por mes
        Object.values(terrainsData).forEach(terrain => {
            if (terrain.createdAt) {
                const date = new Date(terrain.createdAt);
                const monthKey = date.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
                if (monthsData.hasOwnProperty(monthKey)) {
                    monthsData[monthKey]++;
                }
            }
        });

        const ctx = document.getElementById('monthly-chart');
        if (!ctx) return;

        // Destruir gráfico anterior si existe
        if (window.monthlyChart) {
            window.monthlyChart.destroy();
        }

        const labels = Object.keys(monthsData);
        const data = Object.values(monthsData);

        window.monthlyChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Terrenos Creados',
                    data: data,
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#3498db',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        },
                        grid: {
                            color: 'rgba(0,0,0,0.1)'
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(0,0,0,0.1)'
                        }
                    }
                },
                elements: {
                    point: {
                        hoverBackgroundColor: '#2980b9'
                    }
                }
            }
        });

    } catch (error) {
        console.error('Error generando gráfico mensual:', error);
        const container = document.getElementById('monthly-chart').parentElement;
        container.innerHTML = '<div class="no-data">Error cargando datos mensuales</div>';
    }
}

async function generateHourlyChart() {
    try {
        const usersSnapshot = await get(ref(database, 'users'));
        const terrainsSnapshot = await get(ref(database, 'terrains'));
        const usersData = usersSnapshot.val() || {};
        const terrainsData = terrainsSnapshot.val() || {};

        // Inicializar array de 24 horas
        const hourlyActivity = new Array(24).fill(0);

        // Contar actividad por hora basada en lastActivity de usuarios
        Object.values(usersData).forEach(user => {
            if (user.lastActivity) {
                const date = new Date(user.lastActivity);
                const hour = date.getHours();
                hourlyActivity[hour]++;
            }
        });

        // Agregar actividad de creación de terrenos
        Object.values(terrainsData).forEach(terrain => {
            if (terrain.createdAt) {
                const date = new Date(terrain.createdAt);
                const hour = date.getHours();
                hourlyActivity[hour]++;
            }
        });

        const ctx = document.getElementById('hourly-chart');
        if (!ctx) return;

        // Destruir gráfico anterior si existe
        if (window.hourlyChart) {
            window.hourlyChart.destroy();
        }

        const labels = [];
        for (let i = 0; i < 24; i++) {
            labels.push(`${i.toString().padStart(2, '0')}:00`);
        }

        window.hourlyChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Actividad por Hora',
                    data: hourlyActivity,
                    backgroundColor: 'rgba(52, 152, 219, 0.6)',
                    borderColor: '#3498db',
                    borderWidth: 1,
                    borderRadius: 4,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        },
                        grid: {
                            color: 'rgba(0,0,0,0.1)'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        }
                    }
                },
                elements: {
                    bar: {
                        hoverBackgroundColor: 'rgba(52, 152, 219, 0.8)'
                    }
                }
            }
        });

    } catch (error) {
        console.error('Error generando gráfico por horas:', error);
        const container = document.getElementById('hourly-chart').parentElement;
        container.innerHTML = '<div class="no-data">Error cargando datos por horas</div>';
    }
}




// ==================== CONFIGURACIÓN DE TIEMPO REAL ====================
function setupRealTimeUpdates() {
    // Escuchar cambios en usuarios
    const usersRef = ref(database, 'users');
    const usersListener = onValue(usersRef, () => {
        const currentSection = getCurrentSection();
        if (currentSection === 'dashboard' || currentSection === 'users') {
            loadStatistics();
            if (currentSection === 'users') {
                loadUsersData();
            }
        }
    });
    currentListeners.push({ ref: usersRef, listener: usersListener });

    // Escuchar cambios en terrenos
    const terrainsRef = ref(database, 'terrains');
    const terrainsListener = onValue(terrainsRef, () => {
        const currentSection = getCurrentSection();
        if (currentSection === 'dashboard' || currentSection === 'terrains') {
            loadStatistics();
            if (currentSection === 'terrains') {
                loadTerrainsData();
            }
        }
    });
    currentListeners.push({ ref: terrainsRef, listener: terrainsListener });

    // Escuchar cambios en sesiones
    const sessionsRef = ref(database, 'collaboration_sessions');
    const sessionsListener = onValue(sessionsRef, () => {
        const currentSection = getCurrentSection();
        if (currentSection === 'dashboard' || currentSection === 'sessions') {
            loadStatistics();
            if (currentSection === 'sessions') {
                loadSessionsData();
            }
        }
    });
    currentListeners.push({ ref: sessionsRef, listener: sessionsListener });
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    // Refresh de sesiones
    const refreshBtn = document.getElementById('refresh-sessions');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadSessionsData);
    }

    // Exportar reporte
    const exportBtn = document.getElementById('export-report');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportReport);
    }

    // Crear backup
    const backupBtn = document.getElementById('generate-backup');
    if (backupBtn) {
        backupBtn.addEventListener('click', generateBackup);
    }
}

// ==================== FUNCIONES DE ACCIÓN ====================


// ==================== FUNCIONES DE LOS BOTONES DE LA SECCION DE USUARIOS====================

async function viewUserDetails(userId) {
    try {
        showNotification('Cargando detalles del usuario...', 'info');

        // Obtener datos del usuario
        const userRef = ref(database, `users/${userId}`);
        const userSnapshot = await get(userRef);

        if (!userSnapshot.exists()) {
            showNotification('Usuario no encontrado', 'error');
            return;
        }

        const userData = userSnapshot.val();

        // Obtener terrenos creados por el usuario
        const terrainsRef = ref(database, 'terrains');
        const terrainsSnapshot = await get(terrainsRef);
        let userTerrains = [];

        if (terrainsSnapshot.exists()) {
            const terrainsData = terrainsSnapshot.val();
            userTerrains = Object.entries(terrainsData)
                .filter(([_, terrain]) => terrain.createdBy === userId)
                .map(([id, terrain]) => ({ id, ...terrain }));
        }

        // Obtener ubicaciones recientes
        const locationsRef = ref(database, `user_locations/${userId}`);
        const locationsSnapshot = await get(locationsRef);
        let lastLocation = null;

        if (locationsSnapshot.exists()) {
            lastLocation = locationsSnapshot.val();
        }

        // Mostrar modal con detalles
        displayUserDetailsModal(userData, userTerrains, lastLocation);

    } catch (error) {
        console.error('Error cargando detalles del usuario:', error);
        showNotification('Error cargando detalles del usuario', 'error');
    }
}

function displayUserDetailsModal(userData, userTerrains, lastLocation) {
    const modal = document.getElementById('details-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');

    modalTitle.textContent = `Detalles de ${userData.name}`;

    // Calcular estadísticas
    const totalArea = userTerrains.reduce((sum, terrain) => sum + (terrain.area || 0), 0);
    const lastActivityText = userData.lastActivity ?
        formatTimestamp(userData.lastActivity) : 'Sin actividad registrada';

    modalBody.innerHTML = `
        <div class="user-details-content">
            <!-- Información Personal -->
            <div class="details-section">
                <h3>📋 Información Personal</h3>
                <div class="details-grid">
                    <div class="detail-item">
                        <label>Nombre:</label>
                        <span>${userData.name}</span>
                    </div>
                    <div class="detail-item">
                        <label>Email:</label>
                        <span>${userData.email}</span>
                    </div>
                    <div class="detail-item">
                        <label>Rol:</label>
                        <span class="role-badge role-${userData.role.toLowerCase()}">${userData.role}</span>
                    </div>
                    <div class="detail-item">
                        <label>Estado:</label>
                        <span class="status-badge ${userData.isOnline ? 'online' : 'offline'}">
                            ${userData.isOnline ? '🟢 En línea' : '🔴 Desconectado'}
                        </span>
                    </div>
                </div>
            </div>

            <!-- Actividad -->
            <div class="details-section">
                <h3>⏰ Actividad</h3>
                <div class="details-grid">
                    <div class="detail-item">
                        <label>Última actividad:</label>
                        <span>${lastActivityText}</span>
                    </div>
                    ${userData.active ? `
                        <div class="detail-item">
                            <label>Activo desde:</label>
                            <span>${formatTimestamp(userData.active)}</span>
                        </div>
                    ` : ''}
                </div>
            </div>

            <!-- Ubicación -->
            ${lastLocation ? `
                <div class="details-section">
                    <h3>📍 Ubicación Actual</h3>
                    <div class="details-grid">
                        <div class="detail-item">
                            <label>Latitud:</label>
                            <span>${lastLocation.latitude.toFixed(6)}</span>
                        </div>
                        <div class="detail-item">
                            <label>Longitud:</label>
                            <span>${lastLocation.longitude.toFixed(6)}</span>
                        </div>
                        <div class="detail-item">
                            <label>Última actualización:</label>
                            <span>${formatTimestamp(lastLocation.timestamp)}</span>
                        </div>
                    </div>
                </div>
            ` : ''}

            <!-- Estadísticas de Terrenos -->
            <div class="details-section">
                <h3>🗺️ Estadísticas de Terrenos</h3>
                <div class="stats-summary">
                    <div class="stat-item">
                        <div class="stat-number">${userTerrains.length}</div>
                        <div class="stat-label">Terrenos Creados</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-number">${formatArea(totalArea)}</div>
                        <div class="stat-label">Área Total</div>
                    </div>
                </div>
            </div>

            <!-- Lista de Terrenos -->
            ${userTerrains.length > 0 ? `
                <div class="details-section">
                    <h3>📋 Terrenos Creados</h3>
                    <div class="terrains-list">
                        ${userTerrains.map(terrain => `
                            <div class="terrain-item">
                                <div class="terrain-info">
                                    <strong>${terrain.name}</strong>
                                    <span class="terrain-area">${formatArea(terrain.area)}</span>
                                </div>
                                <div class="terrain-date">
                                    ${formatDate(terrain.createdAt)}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

            <!-- Acciones -->
            <div class="details-actions">
                <button class="btn btn-primary" onclick="editUser('${userData.id}')">
                    ✏️ Editar Usuario
                </button>
                <button class="btn btn-secondary" onclick="closeModal()">
                    Cerrar
                </button>
            </div>
        </div>
    `;




    // Mostrar modal con animación
        modal.style.display = 'block';
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
}

async function editUser(userId) {
    try {
        showNotification('Cargando datos del usuario...', 'info');

        // Obtener datos actuales del usuario
        const userRef = ref(database, `users/${userId}`);
        const userSnapshot = await get(userRef);

        if (!userSnapshot.exists()) {
            showNotification('Usuario no encontrado', 'error');
            return;
        }

        const userData = userSnapshot.val();
        displayEditUserModal(userData);

    } catch (error) {
        console.error('Error cargando datos del usuario:', error);
        showNotification('Error cargando datos del usuario', 'error');
    }
}

function displayEditUserModal(userData) {
    const modal = document.getElementById('details-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');

    modalTitle.textContent = `Editar Usuario: ${userData.name}`;

    modalBody.innerHTML = `
        <div class="edit-user-content">
            <form id="edit-user-form" class="edit-form">
                <div class="form-group">
                    <label for="edit-name">Nombre:</label>
                    <input type="text" id="edit-name" value="${userData.name}" required>
                </div>

                <div class="form-group">
                    <label for="edit-email">Email:</label>
                    <input type="email" id="edit-email" value="${userData.email}" required>
                </div>

                <div class="form-group">
                    <label for="edit-role">Rol:</label>
                    <select id="edit-role" required>
                        <option value="Topógrafo" ${userData.role === 'Topógrafo' ? 'selected' : ''}>Topógrafo</option>
                        <option value="Supervisor" ${userData.role === 'Supervisor' ? 'selected' : ''}>Supervisor</option>
                        <option value="Administrador" ${userData.role === 'Administrador' ? 'selected' : ''}>Administrador</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>Estado actual:</label>
                    <div class="status-info">
                        <span class="status-badge ${userData.isOnline ? 'online' : 'offline'}">
                            ${userData.isOnline ? '🟢 En línea' : '🔴 Desconectado'}
                        </span>
                        <small>El estado se actualiza automáticamente</small>
                    </div>
                </div>

                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">
                        💾 Guardar Cambios
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">
                        Cancelar
                    </button>
                    ${window.authModule?.isAdmin() ? `
                        <button type="button" class="btn btn-danger" onclick="confirmDeleteUser('${userData.id}', '${userData.name}')">
                            🗑️ Eliminar Usuario
                        </button>
                    ` : ''}
                </div>
            </form>
        </div>
    `;

    // Configurar el submit del formulario
    const form = document.getElementById('edit-user-form');
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        saveUserChanges(userData.id);
    });

     // Mostrar modal con animación
            modal.style.display = 'block';
            setTimeout(() => {
                modal.classList.add('show');
            }, 10);
}

async function saveUserChanges(userId) {
    try {
        const name = document.getElementById('edit-name').value.trim();
        const email = document.getElementById('edit-email').value.trim();
        const role = document.getElementById('edit-role').value;

        if (!name || !email || !role) {
            showNotification('Todos los campos son obligatorios', 'error');
            return;
        }

        showNotification('Guardando cambios...', 'info');

        // Actualizar datos en Firebase
        const userRef = ref(database, `users/${userId}`);
        const updates = {
            name: name,
            email: email,
            role: role
        };

        await update(userRef, updates);

        showNotification('Usuario actualizado exitosamente', 'success');
        closeModal();

        // Recargar la tabla de usuarios
        if (typeof loadUsersData === 'function') {
            loadUsersData();
        }

    } catch (error) {
        console.error('Error actualizando usuario:', error);
        showNotification('Error guardando cambios: ' + error.message, 'error');
    }
}

function confirmDeleteUser(userId, userName) {
    if (!window.authModule?.isAdmin()) {
        showNotification('Solo los administradores pueden eliminar usuarios', 'error');
        return;
    }

    const confirmed = confirm(
        `¿Estás seguro de que quieres eliminar al usuario "${userName}"?\n\n` +
        `Esta acción NO se puede deshacer y eliminará:\n` +
        `- Todos los datos del usuario\n` +
        `- Sus terrenos asociados\n` +
        `- Su historial de ubicaciones\n\n` +
        `¿Continuar?`
    );

    if (confirmed) {
        borrarUser(userId, userName);
    }
}

window.confirmDeleteUser = confirmDeleteUser;

async function borrarUser(userId, userName) {
    try {
        showNotification('Eliminando usuario...', 'info');

        // Eliminar datos del usuario
        const userRef = ref(database, `users/${userId}`);
        await remove(userRef);

        // Eliminar ubicaciones del usuario
        const locationsRef = ref(database, `user_locations/${userId}`);
        await remove(locationsRef);



        // Opcional: También eliminar terrenos creados por el usuario
        /*
        const terrainsRef = ref(database, 'terrains');
        const terrainsSnapshot = await get(terrainsRef);
        if (terrainsSnapshot.exists()) {
            const terrainsData = terrainsSnapshot.val();
            const userTerrains = Object.entries(terrainsData)
                .filter(([_, terrain]) => terrain.createdBy === userId);

            for (const [terrainId, _] of userTerrains) {
                await remove(ref(database, `terrains/${terrainId}`));
            }
        }
        */

        showNotification(`Usuario "${userName}" eliminado exitosamente`, 'success');
        closeModal();

        // Recargar la tabla de usuarios
        if (typeof loadUsersData === 'function') {
            loadUsersData();
        }

    } catch (error) {
        console.error('Error eliminando usuario:', error);
        showNotification('Error eliminando usuario: ' + error.message, 'error');
    }
}


// ==================== FUNCIONES HELPER ====================

function closeModal() {
    const modal = document.getElementById('details-modal');
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
}

window.closeModal = closeModal;

function formatTimestamp(timestamp) {
    try {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) { // Menos de 1 minuto
            return 'Hace menos de 1 minuto';
        } else if (diff < 3600000) { // Menos de 1 hora
            const minutes = Math.floor(diff / 60000);
            return `Hace ${minutes} minuto${minutes > 1 ? 's' : ''}`;
        } else if (diff < 86400000) { // Menos de 1 día
            const hours = Math.floor(diff / 3600000);
            return `Hace ${hours} hora${hours > 1 ? 's' : ''}`;
        } else {
            return date.toLocaleDateString('es-ES', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    } catch (error) {
        return 'Fecha inválida';
    }
}

function formatDate(timestamp) {
    try {
        return new Date(timestamp).toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch (error) {
        return 'Fecha inválida';
    }
}

function formatArea(area) {
    if (area < 10000) {
        return `${area.toFixed(2)} m²`;
    } else {
        return `${(area / 10000).toFixed(2)} ha`;
    }
}

// Configurar cierre del modal al hacer clic fuera
window.addEventListener('click', (event) => {
    const modal = document.getElementById('details-modal');
    if (event.target === modal) {
        closeModal();
    }
});

// Configurar botón de cerrar del modal
document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.querySelector('.modal-close');

    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }
});

//-----------------------------------------------------------------------------------------
//-----------------------BOTONES DE LA SECCION DE TERRAIN-----------------------

async function viewTerrainDetails(terrainId) {
    try {
        console.log(`Cargando detalles del terreno: ${terrainId}`);

        // Obtener datos del terreno
        const terrainSnapshot = await get(ref(database, `terrains/${terrainId}`));

        if (!terrainSnapshot.exists()) {
            showNotification('Terreno no encontrado', 'error');
            return;
        }

        const terrainData = terrainSnapshot.val();

        // Obtener datos del creador
        let creatorName = 'Usuario desconocido';
        if (terrainData.createdBy) {
            try {
                const creatorSnapshot = await get(ref(database, `users/${terrainData.createdBy}`));
                if (creatorSnapshot.exists()) {
                    creatorName = creatorSnapshot.val().name;
                } else {
                    // Verificar si es una sesión colaborativa
                    const sessionSnapshot = await get(ref(database, `collaborative_sessions/${terrainData.createdBy}`));
                    if (sessionSnapshot.exists()) {
                        creatorName = 'Sesión Colaborativa';
                    }
                }
            } catch (error) {
                console.log('Error obteniendo creador:', error);
            }
        }

        displayTerrainDetailsModal(terrainData, creatorName);

    } catch (error) {
        console.error('Error cargando detalles del terreno:', error);
        showNotification('Error cargando detalles del terreno', 'error');
    }
}


async function displayTerrainDetailsModal(terrainData, creatorName) {
    const modal = document.getElementById('details-modal');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');

    title.textContent = `Detalles del Terreno: ${terrainData.name}`;

    // Calcular estadísticas del terreno
    const pointsCount = terrainData.points ? terrainData.points.length : 0;
    const area = formatArea(terrainData.area || 0);
    const creationDate = formatDate(terrainData.createdAt);
    const creationTime = formatTimestamp(terrainData.createdAt);

    // Verificar si es colaborativo y obtener participantes
    let participantsHtml = '';
    const isCollaborative = terrainData.name.toLowerCase().includes('colaborativo');



    if (isCollaborative && terrainData.createdBy) {
        try {
            // Buscar la sesión usando el createdBy como sessionId
            const sessionSnapshot = await get(ref(database, `collaborative_sessions/${terrainData.createdBy}`));



            if (sessionSnapshot.exists()) {
                const sessionData = sessionSnapshot.val();
                console.log(sessionData.participants);
                if (sessionData.participants) {
                    participantsHtml = `
                        <div class="detail-section">
                            <h3>👥 Participantes Colaborativos</h3>
                            <div class="participants-container">
                                ${Object.values(sessionData.participants).map(participant => `
                                    <div class="participant-item">
                                        <span class="participant-name">${participant || 'Usuario desconocido'}</span>
                                        <span class="participant-role">(${participant.role || 'Participante'})</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                }
            }
        } catch (error) {
            console.error('Error obteniendo participantes:', error);
        }
    }

    // Generar coordenadas de puntos para mostrar
    let pointsHtml = '';
    if (terrainData.points && terrainData.points.length > 0) {
        pointsHtml = terrainData.points.map((point, index) => `
            <div class="point-item">
                <strong>Punto ${index + 1}:</strong>
                Lat: ${point.latitude.toFixed(6)},
                Lon: ${point.longitude.toFixed(6)}
            </div>
        `).join('');
    } else {
        pointsHtml = '<div class="no-points">Sin puntos registrados</div>';
    }

    body.innerHTML = `
        <div class="terrain-details">
            <div class="detail-section">
                <h3>📊 Información General</h3>
                <div class="detail-grid">
                    <div class="detail-item">
                        <span class="detail-label">Nombre:</span>
                        <span class="detail-value">${terrainData.name}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Área:</span>
                        <span class="detail-value">${area}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Número de Puntos:</span>
                        <span class="detail-value">${pointsCount}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Creado por:</span>
                        <span class="detail-value">${creatorName}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Fecha de Creación:</span>
                        <span class="detail-value">${creationDate}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Hace:</span>
                        <span class="detail-value">${creationTime}</span>
                    </div>
                </div>
            </div>

            ${participantsHtml}

            <div class="detail-section">
                <h3>📍 Coordenadas de Puntos</h3>
                <div class="points-container">
                    ${pointsHtml}
                </div>
            </div>

            <div class="detail-section">
                <h3>📋 Acciones</h3>
                <div class="terrain-actions">
                    <button class="action-btn" onclick="downloadTerrain('${terrainData.id}')">
                        📥 Descargar Datos
                    </button>
                    <button class="action-btn" onclick="exportTerrainToCSV('${terrainData.id}', '${terrainData.name}')">
                        📊 Exportar CSV
                    </button>
                    <button class="action-btn" onclick="copyTerrainCoordinates('${terrainData.id}')">
                        📋 Copiar Coordenadas
                    </button>
                </div>
            </div>
        </div>
    `;

    modal.style.display = 'block';
    setTimeout(() => {
        modal.classList.add('show');
    }, 10);
}


async function downloadTerrain(terrainId) {
    try {
        console.log(`Descargando terreno: ${terrainId}`);

        // Obtener datos del terreno
        const terrainSnapshot = await get(ref(database, `terrains/${terrainId}`));

        if (!terrainSnapshot.exists()) {
            showNotification('Terreno no encontrado', 'error');
            return;
        }

        const terrainData = terrainSnapshot.val();

        // Obtener datos del creador
        let creatorName = 'Usuario desconocido';
        if (terrainData.createdBy) {
            try {
                const creatorSnapshot = await get(ref(database, `users/${terrainData.createdBy}`));
                if (creatorSnapshot.exists()) {
                    creatorName = creatorSnapshot.val().name;
                } else {
                    const sessionSnapshot = await get(ref(database, `collaborative_sessions/${terrainData.createdBy}`));
                    if (sessionSnapshot.exists()) {
                        creatorName = 'Sesión Colaborativa';
                    }
                }
            } catch (error) {
                console.log('Error obteniendo creador:', error);
            }
        }

        // Crear objeto de descarga
        const downloadData = {
            id: terrainData.id,
            nombre: terrainData.name,
            area_m2: terrainData.area,
            puntos_total: terrainData.points ? terrainData.points.length : 0,
            creado_por: creatorName,
            fecha_creacion: new Date(terrainData.createdAt).toISOString(),
            coordenadas: terrainData.points || []
        };

        // Crear y descargar archivo JSON
        const blob = new Blob([JSON.stringify(downloadData, null, 2)], {
            type: 'application/json'
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `terreno_${terrainData.name}_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showNotification(`Terreno "${terrainData.name}" descargado exitosamente`, 'success');

    } catch (error) {
        console.error('Error descargando terreno:', error);
        showNotification('Error descargando terreno', 'error');
    }
}


// Función para exportar a CSV
async function exportTerrainToCSV(terrainId, terrainName) {
    try {
        const terrainSnapshot = await get(ref(database, `terrains/${terrainId}`));

        if (!terrainSnapshot.exists()) {
            showNotification('Terreno no encontrado', 'error');
            return;
        }

        const terrainData = terrainSnapshot.val();

        // Crear CSV
        let csvContent = 'Punto,Latitud,Longitud,Timestamp\n';

        if (terrainData.points) {
            terrainData.points.forEach((point, index) => {
                const timestamp = point.timestamp ? new Date(point.timestamp).toISOString() : '';
                csvContent += `${index + 1},${point.latitude},${point.longitude},${timestamp}\n`;
            });
        }

        // Descargar CSV
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `terreno_${terrainName}_coordenadas.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showNotification('CSV exportado exitosamente', 'success');

    } catch (error) {
        console.error('Error exportando CSV:', error);
        showNotification('Error exportando CSV', 'error');
    }
}

// Función para copiar coordenadas al portapapeles
async function copyTerrainCoordinates(terrainId) {
    try {
        const terrainSnapshot = await get(ref(database, `terrains/${terrainId}`));

        if (!terrainSnapshot.exists()) {
            showNotification('Terreno no encontrado', 'error');
            return;
        }

        const terrainData = terrainSnapshot.val();

        if (!terrainData.points || terrainData.points.length === 0) {
            showNotification('No hay coordenadas para copiar', 'warning');
            return;
        }

        // Formatear coordenadas
        const coordinates = terrainData.points.map((point, index) =>
            `Punto ${index + 1}: ${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}`
        ).join('\n');

        // Copiar al portapapeles
        await navigator.clipboard.writeText(coordinates);
        showNotification('Coordenadas copiadas al portapapeles', 'success');

    } catch (error) {
        console.error('Error copiando coordenadas:', error);
        showNotification('Error copiando coordenadas', 'error');
    }
}

// Hacer funciones disponibles globalmente
window.exportTerrainToCSV = exportTerrainToCSV;
window.copyTerrainCoordinates = copyTerrainCoordinates;


//------------------------------------------------------------------------------------------

//-----------------------BOTONES DE LA SECCION DE SESIONES COLABORATIVAS-----------------------


async function viewSessionDetails(sessionId) {
    try {
        console.log(`Cargando detalles de la sesión: ${sessionId}`);

        // Obtener datos de la sesión
        const sessionSnapshot = await get(ref(database, `collaborative_sessions/${sessionId}`));

        if (!sessionSnapshot.exists()) {
            showNotification('Sesión no encontrada', 'error');
            return;
        }

        const sessionData = sessionSnapshot.val();


        // Obtener puntos de la sesión
        const pointsSnapshot = await get(ref(database, `session_points/${sessionId}`));
        const sessionPoints = pointsSnapshot.exists() ? pointsSnapshot.val() : {};

        // Obtener datos del creador
        let creatorName = 'Usuario desconocido';
        if (sessionData.creator) {
            const creatorSnapshot = await get(ref(database, `users/${sessionData.creator}`));
            if (creatorSnapshot.exists()) {
                creatorName = creatorSnapshot.val().name;
            }
        }

        displaySessionDetailsModal(sessionData, sessionPoints, creatorName, sessionId);

    } catch (error) {
        console.error('Error cargando detalles de la sesión:', error);
        showNotification('Error cargando detalles de la sesión', 'error');
    }
}


function displaySessionDetailsModal(sessionData, sessionPoints, creatorName, sessionId) {
    const modal = document.getElementById('details-modal');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');

    title.textContent = `Detalles de Sesión: ${sessionData.code}`;

    // Calcular estadísticas
    const pointsCount = Object.keys(sessionPoints).length;
    const participantsCount = sessionData.participants ? Object.keys(sessionData.participants).length : 0;
    const creationDate = formatDate(sessionData.createdAt);
    const creationTime = formatTimestamp(sessionData.createdAt);
    const statusClass = sessionData.status === 'active' ? 'status-active' : 'status-completed';
    const statusText = sessionData.status === 'active' ? 'Activa' : 'Completada';

    // Generar lista de participantes
    let participantsHtml = '';
    if (sessionData.participants) {
        participantsHtml = Object.entries(sessionData.participants).map(([userId, userName]) => `
            <div class="participant-item">
                <span class="participant-name">${userName}</span>
                <span class="participant-role">${userId === sessionData.creator ? '(Creador)' : '(Participante)'}</span>
            </div>
        `).join('');
    } else {
        participantsHtml = '<div class="no-participants">No hay participantes registrados</div>';
    }

    // Generar lista de puntos
    let pointsHtml = '';
    if (pointsCount > 0) {
        pointsHtml = Object.entries(sessionPoints).map(([pointId, pointData], index) => `
            <div class="point-item">
                <strong>Punto ${index + 1}:</strong>
                Lat: ${pointData.latitude.toFixed(6)},
                Lng: ${pointData.longitude.toFixed(6)}
                <span class="point-time">(${formatTimestamp(pointData.timestamp)})</span>
            </div>
        `).join('');
    } else {
        pointsHtml = '<div class="no-points">No hay puntos registrados</div>';
    }

    body.innerHTML = `
        <div class="session-details">
            <div class="detail-section">
                <h3>Información General</h3>
                <div class="detail-grid">
                    <div class="detail-item">
                        <span class="detail-label">Código:</span>
                        <span class="detail-value session-code">${sessionData.code}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Estado:</span>
                        <span class="detail-value ${statusClass}">${statusText}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Creador:</span>
                        <span class="detail-value">${creatorName}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Fecha:</span>
                        <span class="detail-value">${creationDate}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Hora:</span>
                        <span class="detail-value">${creationTime}</span>
                    </div>
                </div>
            </div>

            <div class="detail-section">
                <h3>Estadísticas</h3>
                <div class="detail-grid">
                    <div class="detail-item">
                        <span class="detail-label">Participantes:</span>
                        <span class="detail-value">${participantsCount}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Puntos agregados:</span>
                        <span class="detail-value">${pointsCount}</span>
                    </div>
                </div>
            </div>

            <div class="detail-section">
                <h3>Participantes</h3>
                <div class="participants-container">
                    ${participantsHtml}
                </div>
            </div>

            <div class="detail-section">
                <h3>Puntos del Terreno</h3>
                <div class="points-container">
                    ${pointsHtml}
                </div>
            </div>

            <div class="session-actions">
                <button class="action-btn" onclick="copySessionCode('${sessionData.code}')">
                    📋 Copiar Código
                </button>
                <button class="action-btn" onclick="exportSessionData('${sessionData.id}')">
                    📊 Exportar Datos
                </button>
                ${sessionData.status === 'active' ?
                    `<button class="action-btn danger" onclick="terminateSession('${sessionData.id}')">
                        ⏹️ Terminar Sesión
                    </button>` : ''
                }

                <button class="action-btn btn-danger danger" onclick="deleteSession('${sessionId}')">
                                    🗑️ Eliminar Sesión
                </button>
            </div>
        </div>
    `;

    modal.style.display = 'block';
            setTimeout(() => {
                modal.classList.add('show');
            }, 10);
}

async function manageSession(sessionId) {
    try {
        console.log(`Gestionando sesión: ${sessionId}`);

        // Obtener datos de la sesión
        const sessionSnapshot = await get(ref(database, `collaborative_sessions/${sessionId}`));

        if (!sessionSnapshot.exists()) {
            showNotification('Sesión no encontrada', 'error');
            return;
        }

        const sessionData = sessionSnapshot.val();
        const isActive = sessionData.status === 'active';

        // Mostrar opciones de gestión
        showSessionManagementOptions(sessionId, sessionData, isActive);

    } catch (error) {
        console.error('Error gestionando sesión:', error);
        showNotification('Error gestionando sesión', 'error');
    }
}


function showSessionManagementOptions(sessionId, sessionData, isActive) {
    const modal = document.getElementById('details-modal');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');

    title.textContent = `Gestionar Sesión: ${sessionData.code}`;

    const statusText = isActive ? 'Activa' : 'Completada';
    const statusClass = isActive ? 'status-active' : 'status-completed';

    body.innerHTML = `
        <div class="session-management">
            <div class="session-info">
                <h3>Información de la Sesión</h3>
                <p><strong>Código:</strong> ${sessionData.code}</p>
                <p><strong>Estado:</strong> <span class="${statusClass}">${statusText}</span></p>
                <p><strong>Participantes:</strong> ${sessionData.participants ? Object.keys(sessionData.participants).length : 0}</p>
            </div>

            <div class="management-actions">
                <h3>Acciones Disponibles</h3>

                <button class="management-btn" onclick="viewSessionDetails('${sessionId}')">
                    👁️ Ver Detalles Completos
                </button>

                <button class="management-btn" onclick="exportSessionData('${sessionId}')">
                    📊 Exportar Datos de Sesión
                </button>

                <button class="management-btn" onclick="copySessionCode('${sessionData.code}')">
                    📋 Copiar Código de Sesión
                </button>

                ${isActive ? `
                    <button class="management-btn warning" onclick="terminateSession('${sessionId}')">
                        ⏹️ Terminar Sesión
                    </button>
                ` : ''}

                <button class="management-btn danger" onclick="deleteSession('${sessionId}')">
                    🗑️ Eliminar Sesión
                </button>
            </div>
        </div>
    `;

    modal.style.display = 'block';
            setTimeout(() => {
                modal.classList.add('show');
            }, 10);
}


// Función para copiar código de sesión
async function copySessionCode(sessionCode) {
    try {
        await navigator.clipboard.writeText(sessionCode);
        showNotification('Código copiado al portapapeles', 'success');
    } catch (error) {
        console.error('Error copiando código:', error);
        showNotification('Error copiando código', 'error');
    }
}

// Función para exportar datos de sesión
async function exportSessionData(sessionId) {
    try {
        const sessionSnapshot = await get(ref(database, `collaborative_sessions/${sessionId}`));
        const pointsSnapshot = await get(ref(database, `session_points/${sessionId}`));

        if (!sessionSnapshot.exists()) {
            showNotification('Sesión no encontrada', 'error');
            return;
        }

        const sessionData = sessionSnapshot.val();
        const sessionPoints = pointsSnapshot.exists() ? pointsSnapshot.val() : {};

        const exportData = {
            session: sessionData,
            points: sessionPoints,
            exportedAt: new Date().toISOString(),
            exportedBy: 'Admin Panel'
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json'
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sesion_${sessionData.code}_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showNotification('Datos de sesión exportados exitosamente', 'success');

    } catch (error) {
        console.error('Error exportando datos:', error);
        showNotification('Error exportando datos', 'error');
    }
}

// Función para terminar sesión activa
async function terminateSession(sessionId) {
    if (!confirm('¿Estás seguro de que quieres terminar esta sesión? Esta acción no se puede deshacer.')) {
        return;
    }

    try {
        await update(ref(database, `collaborative_sessions/${sessionId}`), {
            status: 'completed',
            completedAt: Date.now(),
            completedBy: 'admin'
        });

        showNotification('Sesión terminada exitosamente', 'success');
        document.getElementById('details-modal').style.display = 'none';
        loadSessionsData() ; // Recargar lista de sesiones

    } catch (error) {
        console.error('Error terminando sesión:', error);
        showNotification('Error terminando sesión', 'error');
    }
}

// Función para eliminar sesión
async function deleteSession(sessionId) {
    if (!confirm('¿Estás seguro de que quieres ELIMINAR esta sesión? Esta acción eliminará todos los datos y no se puede deshacer.')) {
        return;
    }

    try {
        // Eliminar sesión y sus puntos
        await remove(ref(database, `collaborative_sessions/${sessionId}`));
        await remove(ref(database, `session_points/${sessionId}`));

        showNotification('Sesión eliminada exitosamente', 'success');
        document.getElementById('details-modal').style.display = 'none';
        loadSessionsData() ; // Recargar lista de sesiones

    } catch (error) {
        console.error('Error eliminando sesión:', error);
        showNotification('Error eliminando sesión', 'error');
    }
}

// Hacer funciones disponibles globalmente
window.copySessionCode = copySessionCode;
window.exportSessionData = exportSessionData;
window.terminateSession = terminateSession;
window.deleteSession = deleteSession;


//------------------------------------------------------------------------------------------
//-----------------------FUNCIONES DE EXPORTACION DE REPORTES-----------------------


function exportReport() {
    try {
        showNotification('Generando reporte...', 'info');

        // Recopilar datos del sistema
        const reportData = {
            timestamp: new Date().toISOString(),
            stats: {
                totalUsers: document.querySelector('.stat-card.users .stat-number')?.textContent || '0',
                totalTerrains: document.querySelector('.stat-card.terrains .stat-number')?.textContent || '0',
                activeSessions: document.querySelector('.stat-card.sessions .stat-number')?.textContent || '0',
                totalArea: document.querySelector('.stat-card.area .stat-number')?.textContent || '0',
                onlineUsers: document.querySelector('.stat-card.online .stat-number')?.textContent || '0'
            },
            users: [],
            terrains: [],
            sessions: []
        };

        // Obtener datos de usuarios desde Firebase
        get(ref(database, 'users'))
            .then(snapshot => {
                snapshot.forEach(child => {
                    const userData = child.val();
                    reportData.users.push({
                        id: child.key,
                        name: userData.name || 'Sin nombre',
                        email: userData.email || 'Sin email',
                        role: userData.role || 'Sin rol',
                        active: userData.active || false,
                        lastActivity: userData.lastActivity ?
                            new Date(userData.lastActivity).toLocaleString('es-ES') : 'Nunca',
                        isOnline: userData.isOnline || false
                    });
                });

                // Obtener datos de terrenos
                return get(ref(database, 'users'));
            })
            .then(snapshot => {
                snapshot.forEach(child => {
                    const terrainData = child.val();
                    reportData.terrains.push({
                        id: child.key,
                        name: terrainData.name || 'Terreno sin nombre',
                        area: terrainData.area || 0,
                        points: terrainData.points?.length || 0,
                        createdBy: terrainData.createdBy || 'Desconocido',
                        createdAt: terrainData.createdAt ?
                            new Date(terrainData.createdAt).toLocaleString('es-ES') : 'Fecha desconocida'
                    });
                });

                // Obtener datos de sesiones colaborativas
                return get(ref(database, 'collaborative_sessions'));
            })
            .then(snapshot => {
                snapshot.forEach(child => {
                    const sessionData = child.val();
                    reportData.sessions.push({
                        id: child.key,
                        code: sessionData.code || 'Sin código',
                        createdBy: sessionData.createdBy || 'Desconocido',
                        status: sessionData.status || 'Desconocido',
                        participants: Object.keys(sessionData.participants || {}).length,
                        createdAt: sessionData.createdAt ?
                            new Date(sessionData.createdAt).toLocaleString('es-ES') : 'Fecha desconocida',
                        finishedAt: sessionData.finishedAt ?
                            new Date(sessionData.finishedAt).toLocaleString('es-ES') : null
                    });
                });

                // Generar reporte en formato HTML
                generateHTMLReport(reportData);

                // También generar en JSON
                generateJSONReport(reportData);

                showNotification('Reporte generado exitosamente', 'success');
            })
            .catch(error => {
                console.error('Error generando reporte:', error);
                showNotification('Error al generar el reporte: ' + error.message, 'error');
            });

    } catch (error) {
        console.error('Error en exportReport:', error);
        showNotification('Error inesperado al generar reporte', 'error');
    }
}

function generateHTMLReport(data) {
    const reportHTML = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Reporte del Sistema - ${new Date().toLocaleDateString('es-ES')}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
                .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 20px; }
                .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
                .stat-card { background: #f8fafc; padding: 20px; border-radius: 8px; text-align: center; border: 1px solid #e2e8f0; }
                .stat-number { font-size: 2rem; font-weight: bold; color: #2563eb; }
                .stat-label { color: #64748b; font-size: 0.9rem; margin-top: 5px; }
                .section { margin-bottom: 40px; }
                .section h2 { color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                th, td { border: 1px solid #e2e8f0; padding: 12px; text-align: left; }
                th { background: #f1f5f9; font-weight: 600; }
                tr:nth-child(even) { background: #f8fafc; }
                .status-active { color: #059669; font-weight: bold; }
                .status-inactive { color: #dc2626; font-weight: bold; }
                .role-admin { background: #ef4444; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; }
                .role-supervisor { background: #3b82f6; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; }
                .role-topografo { background: #10b981; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>📊 Reporte del Sistema TopografíaApp</h1>
                <p>Generado el: ${new Date().toLocaleString('es-ES')}</p>
            </div>

            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-number">${data.stats.totalUsers}</div>
                    <div class="stat-label">👥 Total Usuarios</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${data.stats.totalTerrains}</div>
                    <div class="stat-label">🗺️ Total Terrenos</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${data.stats.activeSessions}</div>
                    <div class="stat-label">🔄 Sesiones Activas</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${data.stats.totalArea}</div>
                    <div class="stat-label">📐 Área Total (m²)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${data.stats.onlineUsers}</div>
                    <div class="stat-label">🟢 Usuarios Online</div>
                </div>
            </div>

            <div class="section">
                <h2>👥 Usuarios Registrados</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Nombre</th>
                            <th>Email</th>
                            <th>Rol</th>
                            <th>Estado</th>
                            <th>Última Actividad</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.users.map(user => `
                            <tr>
                                <td>${user.name}</td>
                                <td>${user.email}</td>
                                <td><span class="role-${user.role.toLowerCase()}">${user.role}</span></td>
                                <td><span class="${user.isOnline ? 'status-active' : 'status-inactive'}">${user.isOnline ? 'Online' : 'Offline'}</span></td>
                                <td>${user.lastActivity}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <div class="section">
                <h2>🗺️ Terrenos Registrados</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Nombre</th>
                            <th>Área (m²)</th>
                            <th>Puntos</th>
                            <th>Creado Por</th>
                            <th>Fecha Creación</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.terrains.map(terrain => `
                            <tr>
                                <td>${terrain.name}</td>
                                <td>${terrain.area.toFixed(2)}</td>
                                <td>${terrain.points}</td>
                                <td>${terrain.createdBy}</td>
                                <td>${terrain.createdAt}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <div class="section">
                <h2>🔄 Sesiones Colaborativas</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Código</th>
                            <th>Estado</th>
                            <th>Participantes</th>
                            <th>Creado Por</th>
                            <th>Fecha Creación</th>
                            <th>Fecha Finalización</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.sessions.map(session => `
                            <tr>
                                <td><strong>${session.code}</strong></td>
                                <td><span class="status-${session.status}">${session.status}</span></td>
                                <td>${session.participants}</td>
                                <td>${session.createdBy}</td>
                                <td>${session.createdAt}</td>
                                <td>${session.finishedAt || 'No finalizada'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </body>
        </html>
    `;

    // Descargar reporte HTML
    downloadFile(reportHTML, `reporte_sistema_${new Date().toISOString().split('T')[0]}.html`, 'text/html');
}

function generateJSONReport(data) {
    const jsonReport = JSON.stringify(data, null, 2);
    downloadFile(jsonReport, `reporte_sistema_${new Date().toISOString().split('T')[0]}.json`, 'application/json');
}

function generateBackup() {
    try {
        showNotification('Creando backup...', 'info');

        const backupData = {
            timestamp: new Date().toISOString(),
            version: '1.0',
            exportedBy: 'TopografíaApp Admin Panel',
            data: {}
        };

        // Crear backup de todas las colecciones principales
        const collections = ['users', 'terrains', 'collaborative_sessions', 'user_activity'];
        const promises = collections.map(collection =>
            get(ref(database, collection)).then(snapshot => {
                backupData.data[collection] = snapshot.val() || {};
                return { collection, count: Object.keys(snapshot.val() || {}).length };
            })
        );

        Promise.all(promises)
            .then(results => {
                // Agregar metadatos del backup
                backupData.metadata = {
                    collections: results.reduce((acc, result) => {
                        acc[result.collection] = {
                            recordCount: result.count,
                            exported: true
                        };
                        return acc;
                    }, {}),
                    totalRecords: results.reduce((sum, result) => sum + result.count, 0)
                };

                // Generar archivo de backup
                const backupJson = JSON.stringify(backupData, null, 2);
                const fileName = `backup_topografia_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

                downloadFile(backupJson, fileName, 'application/json');

                // Registrar el backup en Firebase
                logBackupActivity(backupData.metadata);

                showNotification(`Backup creado exitosamente. ${backupData.metadata.totalRecords} registros exportados.`, 'success');
            })
            .catch(error => {
                console.error('Error creando backup:', error);
                showNotification('Error al crear backup: ' + error.message, 'error');
            });

    } catch (error) {
        console.error('Error en generateBackup:', error);
        showNotification('Error inesperado al crear backup', 'error');
    }
}

function logBackupActivity(metadata) {
    try {
        const activityData = {
            type: 'backup_created',
            timestamp: new Date().toISOString(),
            metadata: metadata,
            adminUser: 'admin_panel'
        };

        database.ref('backup_history').push(activityData)
            .catch(error => {
                console.warn('No se pudo registrar la actividad del backup:', error);
            });
    } catch (error) {
        console.warn('Error registrando actividad de backup:', error);
    }
}

function downloadFile(content, fileName, mimeType) {
    try {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;

        // Agregar al DOM temporalmente para hacer click
        document.body.appendChild(link);
        link.click();

        // Limpiar
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

    } catch (error) {
        console.error('Error descargando archivo:', error);
        showNotification('Error al descargar archivo', 'error');
    }
}



// ==================== FUNCIONES HELPER ====================
function getCurrentSection() {
    const activeSection = document.querySelector('.section.active, .admin-section.active');
    if (activeSection) {
        return activeSection.id.replace('-section', '');
    }
    return 'dashboard';
}

function checkRolePermission(requiredRole) {
    if (requiredRole === 'Administrador') {
        return window.authModule.isAdmin();
    }
    return true;
}

function timeAgo(timestamp) {
     const now = Date.now();
        const diff = now - timestamp;

        if (diff < 60000) return 'Hace menos de 1 minuto';
        if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)} minutos`;
        if (diff < 86400000) return `Hace ${Math.floor(diff / 3600000)} horas`;
        if (diff < 2592000000) return `Hace ${Math.floor(diff / 86400000)} días`;

        const date = new Date(timestamp);
        return date.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
    }, 100);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Limpiar listeners al cerrar
window.addEventListener('beforeunload', () => {
    currentListeners.forEach(({ ref: dbRef, listener }) => {
        off(dbRef, 'value', listener);
    });
});

// Hacer funciones globales para los botones
window.viewUserDetails = viewUserDetails;
window.editUser = editUser;
window.viewTerrainDetails = viewTerrainDetails;
window.downloadTerrain = downloadTerrain;
window.viewSessionDetails = viewSessionDetails;
window.manageSession = manageSession;

console.log('Dashboard module cargado completamente');