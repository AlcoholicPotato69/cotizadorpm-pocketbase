# Resumen de Pruebas: Validaciones RBAC y Despliegue

Última fecha de ejecución: 2026-05

A continuación, se documentan las pruebas de regresión realizadas sobre el control de accesos (RBAC), el despliegue mediante scripts y los ajustes generales a la aplicación.

---

## 1. Pruebas de Despliegue (Scripts `.bat`)

| Escenario | Resultado Esperado | Resultado Obtenido | Estado |
| :--- | :--- | :--- | :--- |
| Ejecutar `levantar-todo.bat` | Debe levantar prompts para pedir IPs/Puertos e instalar servicio. | El script capturó correctamente entradas como `192.168.x.x` y derivó a `backend-service.bat`. | **Aprobado** |
| Compilación del Wrapper C# | `build-service-host.bat` debe compilar sin errores en Windows 10+. | El `CotizadorServiceHost.exe` se generó correctamente usando `csc.exe` de .NET 4. | **Aprobado** |
| PocketBase Binario | Confirmar que es la versión oficial y no un custom fork. | El hash y ejecución demuestran que es PocketBase v0.38.1 oficial (`pocketbase --version`). | **Aprobado** |
| Sincronización de IPs | `sync-frontend-runtime.ps1` inyecta las URL al JSON y a env.js. | El frontend apuntó sin fallos al `BACKEND_URL` configurado dinámicamente, evadiendo hardcodes. | **Aprobado** |

---

## 2. Pruebas de Backend RBAC (`pb_hooks`)

| Escenario | Tenant | Rol Evaluado | Resultado Esperado | Resultado Obtenido | Estado |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Acceso entre tenants | Casa de Piedra | Operador CP | Denegado si intenta llamar al API de Plaza Mayor | `rbac_shared.js` denegó el cruce en `evaluateAction` (`tenantAllowed = false`). | **Aprobado** |
| Administrador Universal | Cualquiera | Admin | `is_admin` se computa a `true` y tiene todos los permisos activos. | Admin elude validación granular y entra directo por ser Superuser/Admin. | **Aprobado** |
| Protección sobre `app_users` | Plaza Mayor | User (No-admin) | Falla si el usuario intenta inyectarse nuevos roles o alterar metadata. | Rechazo explícito en `34_rbac_admin.pb.js` lanzando `BadRequestError`. | **Aprobado** |
| Verificación de Documentos | N/A | Roles mixtos | Un rol ventas sin `clients_verify` falla al hacer update en estado documental. | `client_profile_shared.js` rechazó un cambio documental por falta de permisos. | **Aprobado** |

---

## 3. Pruebas de Interfaz de Usuario y Renderizado Dinámico

| Escenario | Rol Evaluado | Resultado Esperado | Resultado Obtenido | Estado |
| :--- | :--- | :--- | :--- | :--- |
| Dashboard Cards | Usuario sin módulos (Vacio) | El index detecta 0 apps y dibuja el loader/aviso de "Sin módulos asignados". | Correcto, el grid queda limpio sin mostrar rutas o tarjetas inaccesibles. | **Aprobado** |
| Eliminación de Nav Links | Perfil sin acceso a reportes | El botón de navegación "Reportes" no existe en el layout global. | Layout iteró sobre `navRules`, comprobó false y ocultó/eliminó el nodo `a[href]`. | **Aprobado** |
| Bloqueo Manual por URL | Perfil de "solo lecturas" | Redirección forzada de `/cotizador/config.html` al index/home. | El layout interceptó la ruta en `canAccessCurrentRoute` y llamó a `__HUB_SAFE_NAVIGATE` al login. | **Aprobado** |
| Unificación UI Loaders | Cualquier usuario | Al presionar un botón de guardar (ej: Generar PDF), muestra spinner sin freeze. | Todos los botones nativos de `.disabled = true` reemplazados con `setButtonLoading(btn)`. | **Aprobado** |
