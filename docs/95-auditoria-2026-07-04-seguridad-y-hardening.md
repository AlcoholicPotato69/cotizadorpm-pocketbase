# Auditoria de Seguridad y Hardening

Ultima actualizacion: 2026-07-04

Auditoria general con criterios de best-practices (Lighthouse/OWASP) y ponytail-audit (complejidad innecesaria). Alcance: frontend, hooks PocketBase, scripts operativos y documentacion.

## Resumen ejecutivo

| Area | Estado antes | Accion |
| --- | --- | --- |
| CORS API | Cualquier origen `http(s)://` aceptado | Corregido: solo loopback, RFC1918 o mismo host |
| Exposicion de token en login | Token en JSON para cualquier peticion con header `Origin` | Corregido: solo origenes permitidos |
| Headers de seguridad API | Parciales (solo endpoints de sesion) | Ampliado a todas las respuestas `/api/` |
| Datos vivos en git | `backend/pb_data/` versionado | `.gitignore` actualizado; ver desindexado abajo |
| Script de diagnostico | `check_rules.js` con ruta absoluta a SQLite | Eliminado |
| Documentacion operativa | Rutas obsoletas (`audit-smoke`, `frontend-dev-start`) | Actualizada |
| Console en produccion | Parcial (`env.js` silencia fuera de localhost) | Ya activo; mantener |

## Hallazgos corregidos

### 1. CORS demasiado permisivo (critico)

**Problema:** `shouldAllowCorsOrigin` en `backend/pb_hooks/20_auth_session.pb.js` aceptaba cualquier URL con esquema `http` o `https`, contradiciendo la documentacion en `docs/15-seguridad-y-validaciones.md`.

**Impacto:** Un sitio malicioso en internet podia hacer peticiones cross-origin autenticadas (con cookies) si el usuario tenia sesion activa y el backend era accesible desde la red.

**Correccion:** La validacion de origen vive ahora en `backend/pb_hooks/auth_session_shared.js` (`isAllowedRequestOrigin`):

- loopback (`127.0.0.1`, `localhost`, `::1`)
- IPv4 privadas RFC1918 (`10.x`, `172.16-31.x`, `192.168.x`)
- host del `Origin` igual al `Host` / `X-Forwarded-Host` de la peticion

### 2. Filtrado de token de sesion (alto)

**Problema:** `shouldExposeTokenForRequest` devolvia el token en el cuerpo JSON del login/refresh para cualquier peticion con header `Origin`.

**Correccion:** Misma whitelist que CORS. En despliegue same-origin (recomendado) el token viaja solo en cookie `httpOnly`; el JSON queda vacio.

### 3. Headers de seguridad en API (medio)

**Correccion:** `applyApiSecurityHeaders` agrega en todas las respuestas `/api/`:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`

Los endpoints de sesion mantienen adicionalmente `Cache-Control: no-store`.

### 4. Datos sensibles en el repositorio (critico operativo)

**Problema:** `backend/pb_data/` (SQLite, uploads, backups) aparecia en el historial de git.

**Correccion:** Entradas en `.gitignore`. Para dejar de trackear datos ya commitados (ejecutar una sola vez):

```bat
git rm -r --cached backend\pb_data
git commit -m "Dejar de versionar pb_data (datos vivos)"
```

Respaldar `pb_data` antes de cualquier operacion destructiva.

### 5. Script ad-hoc de reglas (bajo)

**Problema:** `check_rules.js` en la raiz leia `data.db` con ruta absoluta del desarrollador.

**Correccion:** Archivo eliminado.

## Ponytail-audit (complejidad)

Hallazgos priorizados (no aplicados en este pase — requieren refactor mayor):

| Tag | Que recortar | Reemplazo | Ruta |
| --- | --- | --- | --- |
| shrink | Helpers CORS duplicados en hook vs shared | Ya unificados en `auth_session_shared.js` | `backend/pb_hooks/` |
| delete | ~120 lineas en blanco en env.js | Nada | `frontend/client/public/assets/libs/js/env.js` — corregido |
| delete | `check_rules.js` | Nada | raiz — eliminado |
| yagni | `pb-client.js` y `pb-core.js` duplican lectura de auth storage | Un solo modulo cuando se toque auth de nuevo | `frontend/client/services/` |
| yagni | `cotizador/clientes.js` vs `cotizadorcp/clientes.js` (~4000 LOC c/u) | Extraer solo si un bug exige paridad | `frontend/client/cotizador*/` |

**net:** ~130 lineas eliminadas en este pase; deps: 0.

## Controles ya presentes (sin cambio)

Documentados en `docs/15-seguridad-y-validaciones.md`:

- Cookie de sesion `httpOnly`, `SameSite=Strict`, `Secure` bajo TLS
- Sanitizacion XSS en `frontend/client/services/security.js`
- Throttling de cotizaciones publicas
- Reglas PocketBase por tenant (RBAC)
- Escaneo Defender en uploads del expediente cliente
- Silenciado de `console.*` fuera de localhost en `env.js`

## Recomendaciones pendientes (no bloqueantes en local)

1. **HTTPS en red local:** usar `production\backend-service.bat enable-https` o Nginx con TLS.
2. **CSP:** agregar header en Nginx/proxy; empezar con `Content-Security-Policy-Report-Only`.
3. **HSTS:** solo cuando TLS este estable en produccion.
4. **innerHTML:** paginas admin usan `escapeHtml` donde hay datos de usuario; mantener el patron al agregar UI.
5. **Tokens legacy en localStorage:** `pb-core.js` migra a `sessionStorage`; limpiar claves `pb_auth` en navegadores viejos si hay sesiones colgadas.

## Verificacion reproducible

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File development\deploy\audit-smoke.ps1
```

Sintaxis de hooks modificados:

```bat
node --check backend\pb_hooks\auth_session_shared.js
node --check backend\pb_hooks\20_auth_session.pb.js
```

## Referencias

- `docs/15-seguridad-y-validaciones.md`
- `docs/80-auditoria-tecnica-y-checklist.md`
- `.agents/skills/best-practices/SKILL.md`
