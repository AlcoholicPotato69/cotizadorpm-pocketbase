# Documentacion Tecnica

Ultima actualizacion: 2026-03-27

Esta carpeta concentra la documentacion vigente del proyecto `cotizadorpm-pocketbase`.
La idea es que TI, soporte y desarrollo tengan una ruta clara para operar, mantener y
diagnosticar el sistema sin depender de notas dispersas.

## Punto de partida recomendado

- Si vas a levantar o reparar el sistema en una PC local:
  lee `docs/20-operacion-local-y-soporte.md`
- Si vas a instalar o mantener el servicio de Windows:
  lee `docs/30-despliegue-y-servicio-windows.md`
- Si necesitas entender el proyecto de punta a punta:
  lee `docs/10-funcionamiento-general-del-codigo.txt`
- Si necesitas ubicar colecciones, tenants y reglas de datos:
  lee `docs/40-modelo-de-datos-y-colecciones.md`
- Si necesitas entender los generadores de PDF y snapshots:
  lee `docs/60-pdfs-y-documentos.md`
- Si estas atendiendo un incidente:
  lee `docs/70-troubleshooting-y-runbooks.md`

## Mapa documental

| Archivo | Objetivo |
| --- | --- |
| `docs/10-funcionamiento-general-del-codigo.txt` | Documento canonico enlazado desde comentarios del codigo. Resume arquitectura, modulos, flujo de datos y puntos de mantenimiento. |
| `docs/20-operacion-local-y-soporte.md` | Arranque local, health checks, logs, backup/restore y checklist diario de soporte. |
| `docs/30-despliegue-y-servicio-windows.md` | Operacion del servicio `CotizadorPocketBase`, HTTPS local, configuracion runtime y despliegue en Windows. |
| `docs/40-modelo-de-datos-y-colecciones.md` | Tenants, colecciones, campos clave, permisos, migraciones y storage. |
| `docs/50-modulos-y-flujos-de-negocio.md` | Que hace cada modulo de Plaza Mayor, Casa de Piedra, paginas publicas y panel de sistema. |
| `docs/60-pdfs-y-documentos.md` | Generadores PDF, editores, snapshot, buckets y reglas para no romper exportacion final. |
| `docs/70-troubleshooting-y-runbooks.md` | Runbooks para fallas comunes de servicio, auth, runtime, PDF, datos y UI. |

## Documentos de raiz

Los archivos de raiz siguen existiendo como puerta de entrada rapida:

- `README.md`
- `MANUAL-IMPLEMENTACION-SERVIDOR-TI.md`
- `DOCUMENTACION-CODIGO-FRONTEND-BACKEND.md`
- `pdf-generators.txt`

Esos documentos ahora apuntan a esta carpeta para evitar duplicidad de versiones.

