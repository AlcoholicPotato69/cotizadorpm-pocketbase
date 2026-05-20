# Cotizador y Gestor de Espacios - Sistema Integral

Sistema web integral de cotizaciones, administración de clientes, generación de contratos y control operativo.
Soporta arquitectura multi-tenant (Plaza Mayor y Casa de Piedra) operando bajo un backend unificado y un robusto control de acceso basado en roles (RBAC).

---

## 1. Arquitectura General

El sistema está construido en un esquema **Cliente-Servidor** clásico, separando claramente las responsabilidades:

*   **Backend (PocketBase):** Actúa como la única fuente de la verdad. Utiliza PocketBase (binario oficial v0.38.1 en Go con SQLite embebido). Maneja la autenticación, base de datos, almacenamiento de documentos (S3-like local), y ejecuta ganchos (hooks) en JavaScript (via goja) para forzar reglas de negocio, permisos y auditoría de extremo a extremo.
*   **Frontend (Vanilla JS + TailwindCSS):** Una SPA ligera. Consume la API REST de PocketBase. La UI reacciona dinámicamente al contexto de seguridad que entrega el backend, ocultando o mostrando módulos, tarjetas en el dashboard y botones de acción según el Rol, Permisos y Tenant (sede) asignados al usuario.

---

## 2. Requisitos Previos

*   **Windows Server / Windows 10/11** (debido al wrapper nativo en C# para instalar como servicio).
*   **PowerShell 5.1+** (para los scripts de despliegue y sincronización).
*   **Python 3.x** (Opcional: Solo usado para levantar el servidor estático local de frontend en modo de desarrollo).
*   **Nginx** (o IIS) para servir el frontend de forma productiva.

---

## 3. Estructura del Repositorio

El proyecto está organizado de manera profesional para separar el desarrollo, la producción y la documentación:

```text
/
├── backend/            # Contiene PocketBase (binario, base de datos, hooks y migraciones)
│   ├── pb_data/        # Base de datos SQLite y archivos de usuario
│   ├── pb_hooks/       # Ganchos JavaScript del backend (Seguridad RBAC y Lógica de Negocio)
│   ├── pb_migrations/  # Esquemas de la base de datos
│   └── pocketbase.exe  # Ejecutable OFICIAL de PocketBase (v0.38.1)
├── frontend/           # Código fuente de la interfaz gráfica
│   └── client/         # HTML, CSS (Tailwind) y JavaScript (Vanilla)
├── development/        # Scripts para levantar el sistema en modo local
├── production/         # Scripts para compilación de servicio, Nginx proxy y despliegue local
└── docs/               # Documentación técnica, arquitectónica y operativa profunda
```

> **NOTA:** Para leer más a fondo sobre cómo modificar el sistema, ver flujos o solucionar problemas, explora la carpeta **[`docs/`](./docs/00-INDICE-DOCUMENTACION.md)** que contiene una amplia gama de guías técnicas.

---

## 4. Instalación y Ejecución Local (Desarrollo)

Para trabajar localmente sin instalar el sistema como un servicio:

1.  Abre una consola (CMD o PowerShell) en la raíz del proyecto.
2.  Inicia el **backend**:
    ```cmd
    .\development\dev-start.bat
    ```
    *(PocketBase iniciará en http://127.0.0.1:8090)*
3.  Abre una nueva consola y levanta el **frontend**:
    ```cmd
    .\development\frontend-dev-start.bat
    ```
    *(El frontend quedará disponible en http://127.0.0.1:8080/client/index.html)*

---

## 5. Despliegue en Producción

El proyecto incluye un flujo robusto y automatizado para generar un servicio en Windows (`CotizadorPocketBase`) sin dependencias como NSSM, compilando su propio host nativo de manera transparente.

1. Abre una consola de **Administrador**.
2. Ejecuta el asistente de despliegue:
   ```cmd
   .\production\levantar-todo.bat
   ```
3. El script te guiará para:
   * Detener procesos huérfanos pasados.
   * Definir la **IP y Puerto** a exponer del backend.
   * Establecer la ruta del frontend.
   * Sincronizar dinámicamente la IP configurada al frontend (`hub-runtime.json` / `env.js`).
   * **Instalar e iniciar el servicio Windows** automáticamente.

Si deseas administrar el servicio manualmente después, puedes usar `.\production\backend-service.bat {start|stop|restart|status}`.

---

## 6. Roles y Permisos (RBAC)

La seguridad se evalúa estrictamente en el Backend a través del hook `rbac_shared.js`.
*   El cálculo combina los permisos del **Rol base** (ej. Administrador, Gerente, Ventas), **Roles extra asignados** y **Permisos Directos del usuario**.
*   El acceso está encapsulado por **Tenant** (`plaza_mayor` o `casa_de_piedra`). Un usuario no puede leer datos ni operar módulos fuera de su sede permitida, aunque intente forzar la URL del frontend o inyectar llamadas al API.
*   **Regla de Oro:** El usuario `admin` o con rol de administrador sobreescribe cualquier negación y recibe acceso total (`allow = true`) implícitamente de parte de las protecciones API (hooks).

---

## 7. Flujo Operativo Principal

1.  **Dashboard:** Al entrar, se le muestran al usuario las aplicaciones disponibles para su perfil y sede (Catálogo, Cotizaciones, Clientes, Reportes, Configuración).
2.  **Catálogo:** Módulo para ver precios y disponibilidad de espacios.
3.  **Cotización:** Se generan presupuestos por evento, guardando snapshots inmutables del estado en PDF.
4.  **Expedientes:** Verificación documental de Clientes (INE, Comprobantes, Actas). Los documentos deben ser "verificados/aprobados" mediante permisos controlados.
5.  **Aprobación/Contrato:** Una cotización aprobada, con expediente liberado, procede a generación de contrato automático en PDF y posteriormente a un ciclo para cargar recibos externos o de facturas.

---

## 8. Consideraciones y Reglas
*   **Veracidad del Backend:** Nunca confíes en el Frontend para seguridad real. Si el frontend se modifica de forma maliciosa, todos los hooks intermedios y de base de datos lo prevendrán gracias a `authorizeOrThrow` en el middleware Goja de PocketBase.
*   **Binario Limpio:** Este sistema se alimenta en producción y en pruebas del binario de PocketBase oficial intacto, no modificado a código fuente. Toda la magia y complejidad residen en `/pb_hooks`.
