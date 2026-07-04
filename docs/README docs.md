# Documentacion Tecnica

Ultima actualizacion: 2026-04-24

Esta carpeta concentra la documentacion vigente para desarrollo, soporte, seguridad y auditoria tecnica del proyecto.

## Lectura recomendada

- arquitectura y mapa del repo: `docs/10-funcionamiento-general-del-codigo.txt`
- seguridad y validaciones: `docs/15-seguridad-y-validaciones.md`
- operacion local y soporte: `docs/20-operacion-local-y-soporte.md`
- despliegue y servicio Windows: `docs/30-despliegue-y-servicio-windows.md`
- requisitos tecnicos del servidor: `docs/35-requisitos-tecnicos-del-servidor.md`
- modelo de datos y colecciones: `docs/40-modelo-de-datos-y-colecciones.md`
- modulos y flujos de negocio: `docs/50-modulos-y-flujos-de-negocio.md`
- Casa de Piedra publicidad/espacios: `docs/55-casa-de-piedra-publicidad-y-espacios.md`
- PDFs y documentos: `docs/60-pdfs-y-documentos.md`
- troubleshooting y runbooks: `docs/70-troubleshooting-y-runbooks.md`
- auditoria tecnica y checklist TI: `docs/80-auditoria-tecnica-y-checklist.md`
- catalogo de funciones y puntos de extension: `docs/85-catalogo-de-funciones-y-puntos-de-extension.md`
- cambios documentados 2026-04-24: `docs/90-cambios-2026-04-24-client-profile-y-control.md`
- auditoria seguridad 2026-07-04: `docs/95-auditoria-2026-07-04-seguridad-y-hardening.md`

## Documentos canonicos

| Archivo | Objetivo |
| --- | --- |
| `docs/10-funcionamiento-general-del-codigo.txt` | arquitectura general, bootstrap, tenants y mapa de archivos |
| `docs/15-seguridad-y-validaciones.md` | auth, sesiones, reglas PocketBase, sanitizacion, throttling y controles |
| `docs/20-operacion-local-y-soporte.md` | arranque local, health checks, logs y soporte operativo |
| `docs/30-despliegue-y-servicio-windows.md` | despliegue, servicio Windows y runtime productivo |
| `docs/35-requisitos-tecnicos-del-servidor.md` | requisitos de hardware, red, disco, seguridad y publicacion productiva |
| `docs/40-modelo-de-datos-y-colecciones.md` | colecciones, reglas, JSON operativos y configuraciones por tenant |
| `docs/50-modulos-y-flujos-de-negocio.md` | recorrido funcional de Plaza Mayor, Casa de Piedra, publico y sistema |
| `docs/55-casa-de-piedra-publicidad-y-espacios.md` | explicacion del modelo hibrido CP y validacion de publicidad/espacios |
| `docs/60-pdfs-y-documentos.md` | generacion, preview y almacenamiento de documentos |
| `docs/70-troubleshooting-y-runbooks.md` | runbooks de falla comun, restauracion y diagnostico |
| `docs/80-auditoria-tecnica-y-checklist.md` | resultado de auditoria tecnica, hallazgos y checklist reproducible |
| `docs/85-catalogo-de-funciones-y-puntos-de-extension.md` | funciones criticas, responsabilidades y puntos seguros de modificacion |
| `docs/95-auditoria-2026-07-04-seguridad-y-hardening.md` | auditoria CORS, tokens, gitignore y hardening API |

## Herramientas de verificacion

- auditoria smoke reproducible: `development/deploy/audit-smoke.ps1`
- arranque local: `development/dev-start.bat` (frontend + backend unificados)
- auditoria seguridad 2026-07-04: `docs/95-auditoria-2026-07-04-seguridad-y-hardening.md`

## Documentos heredados

Los documentos puente o de compatibilidad se conservan en `docs/legacy/`.
