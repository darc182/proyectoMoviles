# 🗺️ TopoMapTracker

**Sistema de Medición de Terrenos con Geolocalización**

Una aplicación móvil completa desarrollada en Kotlin con dashboard web administrativo para la medición precisa de terrenos utilizando tecnología GPS y mapas interactivos.

---

## 👥 Equipo de Desarrollo

- **Darwin Cachimil** 
- **Andrés Tufiño** 
- **Wilmer Vargas** 

---

## 📱 Características Principales

### **Aplicación Móvil (Android)**
- ✅ **Medición de Terrenos**: Captura puntos GPS para delimitar áreas
- ✅ **Mapas Interactivos**: Integración con OpenStreetMap (OSM)
- ✅ **Cálculo de Áreas**: Algoritmos precisos para calcular superficies
- ✅ **Seguimiento en Tiempo Real**: Tracking continuo de ubicación
- ✅ **Autenticación**: Sistema seguro con Firebase Auth
- ✅ **Almacenamiento Cloud**: Base de datos en tiempo real con Firebase
- ✅ **Interfaz Moderna**: UI desarrollada con Jetpack Compose
- ✅ **Trabajo en Segundo Plano**: Servicios para tracking continuo

### **Panel Web Administrativo**
- ✅ **Dashboard Completo**: Visualización de datos y estadísticas
- ✅ **Gestión de Usuarios**: Administración de cuentas y permisos
- ✅ **Visualización de Terrenos**: Mapas interactivos con datos recolectados
- ✅ **Análisis y Reportes**: Gráficos y métricas de uso
- ✅ **Interfaz Responsiva**: Diseño adaptativo para diferentes dispositivos

---

## 🛠️ Tecnologías Utilizadas

### **Mobile (Android)**
- **Kotlin** - Lenguaje principal
- **Jetpack Compose** - Framework UI moderno
- **Firebase Auth** - Autenticación de usuarios
- **Firebase Realtime Database** - Base de datos en tiempo real
- **OpenStreetMap (OSM)** - Mapas y visualización geográfica
- **Google Play Services** - Servicios de ubicación
- **Retrofit** - Cliente HTTP para APIs
- **Work Manager** - Tareas en segundo plano

### **Web Admin**
- **HTML5/CSS3** - Estructura y estilos
- **JavaScript ES6+** - Lógica del frontend
- **Firebase Web SDK** - Integración con servicios Firebase
- **Leaflet.js** - Mapas interactivos web
- **Chart.js** - Gráficos y visualizaciones

### **Backend & Services**
- **Firebase Authentication** - Gestión de usuarios
- **Firebase Realtime Database** - Almacenamiento NoSQL
- **Firebase Security Rules** - Control de acceso

---

## 📋 Requisitos del Sistema

### **Para Desarrollo Android**
- Android Studio Hedgehog | 2023.1.1 o superior
- JDK 11 o superior
- Android SDK API 26+ (Android 8.0)
- Gradle 8.9.1
- Kotlin 2.0.21

### **Para el Panel Web**
- Navegador web moderno (Chrome, Firefox, Safari, Edge)
- Servidor web local (opcional para desarrollo)

---

## 🚀 Instalación y Configuración

### **1. Clonar el Repositorio**

```bash
git clone https://github.com/tu-usuario/TopoMapTracker.git
cd TopoMapTracker
```

### **2. Configuración de Firebase**

#### **2.1 Crear Proyecto en Firebase**
1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Crea un nuevo proyecto
3. Habilita Authentication y Realtime Database

#### **2.2 Configurar App Android**
1. Agrega una app Android al proyecto Firebase
2. Descarga el archivo `google-services.json`
3. Copia el archivo a `app/google-services.json`

#### **2.3 Configurar Web App**
1. Agrega una app Web al proyecto Firebase
2. Copia las credenciales de configuración
3. Crea `web-admin/js/firebase-config.js` usando la plantilla:

```javascript
// Usar firebase-config.js.template como base
cp web-admin/js/firebase-config.js.template web-admin/js/firebase-config.js
// Editar con tus credenciales de Firebase
```

### **3. Configuración de Android**

#### **3.1 Keystore (Para Release)**
```bash
# Crear archivo de configuración
cp keystore.properties.template keystore.properties
# Editar con tus datos de keystore
```

#### **3.2 Abrir en Android Studio**
1. Abre Android Studio
2. Selecciona "Open an existing project"
3. Navega a la carpeta del proyecto
4. Espera a que Gradle sincronice

### **4. Configuración del Panel Web**

#### **4.1 Servidor Local (Opcional)**
```bash
# Con Python
cd web-admin
python -m http.server 8000

# Con Node.js (si tienes live-server)
npx live-server web-admin

# O simplemente abre index.html en el navegador
```

---

## 🔧 Compilación y Ejecución

### **Aplicación Android**

#### **Debug**
```bash
./gradlew assembleDebug
```

#### **Release**
```bash
./gradlew assembleRelease
```

#### **Instalar en Dispositivo**
```bash
./gradlew installDebug
```

### **Panel Web**
Simplemente abre `web-admin/index.html` en un navegador web o usa un servidor local.

---

## 📱 Funcionalidades Detalladas

### **Medición de Terrenos**
1. **Inicio de Medición**: Toca en el mapa para comenzar
2. **Captura de Puntos**: Cada toque agrega un punto GPS
3. **Visualización en Tiempo Real**: Polígono se dibuja automáticamente
4. **Cálculo de Área**: Superficie calculada en metros cuadrados/hectáreas
5. **Guardado**: Los datos se almacenan en Firebase

### **Sistema de Usuarios**
- **Registro**: Creación de cuenta con email/contraseña
- **Login**: Autenticación segura
- **Perfiles**: Gestión de información personal
- **Roles**: Sistema de permisos (Usuario/Administrador)

### **Dashboard Administrativo**
- **Vista General**: Estadísticas de uso y terrenos medidos
- **Gestión de Usuarios**: CRUD completo de usuarios
- **Análisis de Terrenos**: Visualización y filtrado de mediciones
- **Reportes**: Exportación de datos y métricas

---

## 🗂️ Estructura del Proyecto

```
TopoMapTracker/
├── app/                           # Aplicación Android
│   ├── src/main/java/com/ups/topomaptracker/
│   │   ├── activities/           # Actividades adicionales
│   │   ├── models/              # Modelos de datos
│   │   │   ├── Terrain.kt       # Modelo de terreno
│   │   │   └── User.kt          # Modelo de usuario
│   │   ├── services/            # Servicios de background
│   │   │   ├── LocationService.kt
│   │   │   └── LocationTrackingService.kt
│   │   ├── ui/                  # Componentes UI
│   │   ├── MainActivity.kt      # Actividad principal
│   │   ├── LoginActivity.kt     # Pantalla de login
│   │   └── RegisterActivity.kt  # Pantalla de registro
│   ├── build.gradle.kts         # Configuración de build
│   └── google-services.json.template
├── web-admin/                    # Panel web administrativo
│   ├── css/                     # Estilos CSS
│   ├── js/                      # JavaScript
│   │   ├── auth.js             # Autenticación
│   │   ├── dashboard.js        # Dashboard principal
│   │   └── firebase-config.js.template
│   ├── index.html              # Dashboard principal
│   └── login.html              # Login web
├── gradle/                      # Configuración Gradle
├── build.gradle.kts            # Build principal
├── settings.gradle.kts         # Configuración del proyecto
├── keystore.properties.template # Plantilla para keystore
└── README.md                   # Este archivo
```

---

## 🔐 Seguridad

### **Archivos Sensibles**
Los siguientes archivos contienen información sensible y **NO** deben subirse al repositorio:

- `google-services.json` - Credenciales de Firebase
- `firebase-config.js` - Configuración web de Firebase
- `keystore.properties` - Datos del keystore de firma
- `*.keystore` - Archivos de keystore

### **Plantillas Incluidas**
Se proporcionan archivos `.template` para facilitar la configuración:

- `google-services.json.template`
- `firebase-config.js.template`
- `keystore.properties.template`

---

## 🚦 Permisos de Android

La aplicación requiere los siguientes permisos:

```xml
<!-- Ubicación precisa y aproximada -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />

<!-- Servicios en segundo plano -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />

<!-- Red e internet -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

<!-- Notificaciones -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

---

## 🧪 Testing

### **Android Tests**
```bash
# Tests unitarios
./gradlew test

# Tests instrumentados
./gradlew connectedAndroidTest
```

### **Web Tests**
Abre el panel web en diferentes navegadores para verificar compatibilidad.

---

## 📊 Métricas y Analytics

### **Firebase Analytics**
La aplicación incluye Firebase Analytics para:
- Seguimiento de uso de funcionalidades
- Análisis de comportamiento de usuarios
- Métricas de rendimiento

### **Dashboard Metrics**
El panel administrativo muestra:
- Número total de usuarios
- Terrenos medidos por período
- Estadísticas de uso
- Gráficos de actividad

---

## 🛣️ Roadmap

### **Versión Actual (1.0)**
- ✅ Medición básica de terrenos
- ✅ Autenticación de usuarios
- ✅ Dashboard administrativo
- ✅ Mapas interactivos

### **Futuras Versiones**
- 📋 Exportación a formatos CAD
- 📋 Integración con catastro
- 📋 Mediciones offline
- 📋 Colaboración en tiempo real
- 📋 API REST pública
- 📋 App iOS

---

## 🤝 Contribución

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver el archivo `LICENSE` para más detalles.

---

## 📞 Contacto

**Equipo de Desarrollo**
- Darwin Cachimil - [GitHub](https://github.com/darc182)
- Andrés Tufiño - [GitHub](https://github.com/Andrespipe1)
- Wilmer Vargas - [GitHub](https://github.com/wilmer-vargas)

**Proyecto:** [https://github.com/darc182/proyectoMoviles.git](https://github.com/darc182/proyectoMoviles.git)

---

## 🙏 Agradecimientos

- [OpenStreetMap](https://www.openstreetmap.org/) por los datos de mapas
- [Firebase](https://firebase.google.com/) por los servicios backend
- [Jetpack Compose](https://developer.android.com/jetpack/compose) por el framework UI
- [Leaflet](https://leafletjs.com/) por los mapas web interactivos

---

⭐ **¡Si este proyecto te resulta útil, no olvides darle una estrella!** ⭐
