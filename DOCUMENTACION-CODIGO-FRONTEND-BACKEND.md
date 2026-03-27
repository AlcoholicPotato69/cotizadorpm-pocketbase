# Documentacion Tecnica Consolidada

Ultima actualizacion: 2026-03-27

Este archivo queda como documento puente de alto nivel.
La documentacion detallada y vigente ahora vive en `docs/`.

## Documentos canonicos

- `docs/README.md`
- `docs/10-funcionamiento-general-del-codigo.txt`
- `docs/20-operacion-local-y-soporte.md`
- `docs/30-despliegue-y-servicio-windows.md`
- `docs/40-modelo-de-datos-y-colecciones.md`
- `docs/50-modulos-y-flujos-de-negocio.md`
- `docs/60-pdfs-y-documentos.md`
- `docs/70-troubleshooting-y-runbooks.md`

## Resumen ejecutivo

El sistema opera sobre PocketBase y un frontend HTML/JS vanilla para dos tenants:

| Tenant | Schema | Carpeta frontend |
| --- | --- | --- |
| `plaza_mayor` | `finanzas` | `client/cotizador/` |
| `casa_de_piedra` | `finanzas_casadepiedra` | `client/cotizadorcp/` |

## Piezas clave

- `client/js/hub-config.js`
  runtime, backend URL, logos e ICS
- `client/js/layout.js`
  sesion, permisos, layout y responsive global
- `client/services/pb-core.js`
  cliente PocketBase y tenant injection
- `pb_hooks/10_cotizaciones.pb.js`
  proteccion de cotizaciones publicas
- `pb_hooks/30_cp_calendar_ics.pb.js`
  feed ICS para Casa de Piedra

## Para TI

Si necesitas:

- levantar o reparar entorno local:
  ver `docs/20-operacion-local-y-soporte.md`
- operar servicio Windows o HTTPS:
  ver `docs/30-despliegue-y-servicio-windows.md`
- entender colecciones y tenant:
  ver `docs/40-modelo-de-datos-y-colecciones.md`
- diagnosticar PDF, snapshot o documentos:
  ver `docs/60-pdfs-y-documentos.md`
- atender un incidente:
  ver `docs/70-troubleshooting-y-runbooks.md`

