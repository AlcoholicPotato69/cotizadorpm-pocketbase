# Documentación del Proyecto Cotizador Plaza Mayor / Casa de Piedra

## Tecnologías Utilizadas

- **Backend / Base de Datos:** PocketBase (Go, SQLite embebido), que expone APIs REST y Realtime (SSE).
- **Backend Hooks:** JavaScript (a través del motor goja integrado en PocketBase) para personalizar y extender la lógica en base de datos.
- **Frontend:** Vanilla HTML, CSS, JavaScript (ES6+), y TailwindCSS para estilos utilitarios y responsive. FontAwesome para la iconografía.
- **Servidor Web / Proxy (Producción):** Nginx o IIS (Recomendado) para proxy inverso.
- **Seguridad:** Cookie de sesión httponly, Role-Based Access Control (RBAC) personalizado con control multi-tenant y listas de control de acceso.

## Funcionamiento General

El sistema es una solución en la nube (auto-hospedada) que atiende a dos unidades de negocio (Tenants) simultáneamente: **Plaza Mayor (PM)** y **Casa de Piedra (CP)**.

Cada tenant tiene características de negocio particulares:
- **Plaza Mayor:** Gestiona cotizaciones principalmente relacionadas a `publicidad` (lonas, espectaculares, medios digitales).
- **Casa de Piedra:** Es híbrido, maneja cotizaciones de `espacio` (eventos con requerimientos lógicos de tiempo, fechas, asistentes y horas extra) así como también inventario publicitario. El sistema prohíbe mezclar espacios y publicidad en la misma cotización.

A nivel de datos, todo ocurre centralmente en las colecciones (tablas) de PocketBase, mientras que el control se segmenta a nivel Frontend, donde `frontend/client/cotizador/` interactúa con el schema de Plaza Mayor, y `frontend/client/cotizadorcp/` opera el lado de Casa de Piedra.

## Estructura de Directorios Clave

* **`frontend/client/js/`**: Contiene la lógica compartida del Frontend, como `layout.js` (RBAC, permisos, rutas) y `hub-config.js` (configuraciones globales dependientes del entorno).
* **`frontend/client/cotizador/` y `frontend/client/cotizadorcp/`**: Código particular por cada unidad de negocio (gestión de espacios `catalog.js`, calendario `calendar.js`, y facturación `orders.js`/`invoices.js`).
* **`backend/pb_hooks/`**: Contiene los hooks críticos en JavaScript del backend, entre ellos `10_cotizaciones.pb.js` (validaciones de las cotizaciones al insertarse), y `rbac_shared.js` (el corazón de la capa de seguridad del RBAC).
* **`backend/pb_migrations/`**: Lógica de migración inicial de la base de datos SQLite y scripts de esquema y seguridad a nivel de datos.

## Puntos Clave del Sistema

1. **Seguridad Multi-Tenant:**
   El frontend siempre debe inyectar el tenant correspondiente o PocketBase validará negativamente las peticiones cruzadas. Las validaciones de seguridad por tenant evitan fugas de información o visualizaciones erróneas.
2. **Sistema de Roles (RBAC):**
   Las reglas de permiso determinan el tipo de UI a renderizar. Para los administradores (aquellos roles evaluados como `admin`), el acceso se sobreescribe como `true` automáticamente en todas las áreas de la interfaz de usuario para permitir operación ininterrumpida.
3. **Manejo de Formularios Públicos:**
   Las cotizaciones generadas sin autenticación (por usuarios públicos) son obligadas a transicionar al status `pendiente`, y sus campos de información sensible son eliminados antes de enviar la respuesta del servidor.
4. **Convenios:**
   La lógica para habilitar "Convenios" (o tratos preferenciales sin costo/precio estricto) está atada a campos booleanos (`permite_convenio`) y solo se habilita en espacios publicitarios designados.
