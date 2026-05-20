# Índice de Documentación Técnica

La documentación del sistema se encuentra dividida en módulos temáticos para facilitar su comprensión, mantenimiento y extensión.

Por favor consulta los siguientes archivos en este directorio según tu necesidad. Toda la documentación heredada o desfasada ha sido agrupada en el folder `legacy/` para su consulta de contexto histórico sin entorpecer los documentos actuales.

## 1. Guías Maestras (Nuevas)
* **`01-GUIA-RAPIDA-INSTALACION.md`**
  Contiene la guía veloz sobre cómo ejecutar el proyecto localmente y cómo usar los scripts de despliegue automáticos (.bat y PowerShell).
* **`02-SISTEMA-RBAC.md`**
  Un análisis técnico exclusivo sobre cómo están programadas las defensas y la compartimentalización en PocketBase a través de `pb_hooks`, y el reflejo del Frontend (UI Hiding).
* **`03-FLUJO-DE-COTIZACIONES.md`**
  Documento que lista secuencialmente las fases obligadas en el sistema para transicionar un "Lead/Cliente" hacia un "Evento Pagado/Cerrado" mediante Snapshots en base de datos.
* **`95-PRUEBAS-RBAC-Y-DESPLIEGUE.md`**
  Matriz de resultados de pruebas obligatorias, dictaminando qué módulos y casos de uso pasaron el checklist de certificación.

## 2. Documentos de Referencia Históricos (Disponibles en la raíz)
* **`10-funcionamiento-general-del-codigo.txt`**
  Describe la arquitectura base, el bootstrap de PocketBase, la división Multi-Tenant y el mapa general de directorios y responsabilidades.

*(El resto de la documentación heredada ha sido movida a la carpeta `docs/legacy/`)*
