# Manual de Implementacion en Produccion (Equipo TI)

Fecha: 2026-03-20  
Proyecto: `cotizadorpm-pocketbase`  
Objetivo: desplegar en entorno LAN productivo con calendario ICS para Outlook Desktop y soporte HTTPS autofirmado.

---

## 1) Resumen ejecutivo

Este sistema se compone de:
1. Backend PocketBase (`pocketbase.exe`) con datos locales.
2. Frontend estatico (`client/`) publicado en web server interno.
3. Servicio Windows para arranque automatico y configuracion de IP/URL.
4. HTTPS autofirmado en LAN usando proxy local (sin depender de internet).

Calendario recomendado:
1. Todos los usuarios Outlook Desktop se suscriben al mismo feed ICS:
   - `https://IP_O_HOST:PUERTO_HTTPS/api/cotizador/cp-calendar-ics`
2. Cuando cambia un evento en el cotizador, el feed se actualiza.
3. Outlook replica cambios en su siguiente ciclo de refresco.

No requerido para esta modalidad:
1. OAuth.
2. Google Calendar.
3. Servicios cloud externos.

---

## 2) Requisitos de infraestructura

1. Windows Server 2019+ (o Windows 10/11 Pro para PoC).
2. IP fija del servidor (ejemplo: `192.168.1.50`).
3. Consola administrativa (PowerShell/CMD como Administrador).
4. Puertos LAN:
   - Backend HTTP interno: `8090/TCP` (idealmente solo local servidor cuando HTTPS esta activo).
   - Backend HTTPS LAN: `9443/TCP` (o puerto que definan).
   - Frontend: `8080/TCP` o IIS en `80/443`.
5. Politica para distribuir certificado `.cer` a clientes (manual o GPO).
6. Reloj del servidor sincronizado (NTP).

---

## 3) Estructura de despliegue recomendada

```text
C:\cotizador\
  pocketbase.exe
  pb_data\
  pb_hooks\
  pb_migrations\
  client\
  deploy\
    run-pocketbase-service.bat
    run-pocketbase-service.ps1
    configure-https-selfsigned.ps1
    https-reverse-proxy.ps1
  backend-service.bat
```

Archivos locales de produccion (no versionados):
1. `client/config/hub-runtime.override.json`
2. `deploy/backend-service.local.conf`
3. `deploy/certs/`
4. `logs/`

---

## 4) Preparacion inicial

1. Copiar el proyecto al servidor.
2. Verificar existencia de:
   - `pocketbase.exe`
   - `pb_data\`
   - `pb_hooks\`
   - `pb_migrations\`
   - `client\`
   - `deploy\`
3. Abrir PowerShell o CMD como Administrador.
4. Entrar al directorio raiz del proyecto.

### 4.1 Modo local rapido (backend + frontend sin servicio)

Para pruebas funcionales en una sola PC:

```bat
run-local-stack.bat 127.0.0.1 8090 8080
```

Esto:
1. Ajusta `BACKEND_URL` en `hub-runtime.override.json`.
2. Levanta PocketBase.
3. Levanta servidor estatico del frontend.
4. Abre `http://127.0.0.1:8080/index.html`.

Para detener:

```bat
stop-local-stack.bat
```

Opcional (fuerza cierre de todos los procesos `pocketbase.exe`):

```bat
stop-local-stack.bat --force-backend
```

---

## 5) Configuracion base de backend

Configurar URL/backend local inicial:

```bat
backend-service.bat set-ip 192.168.1.50 8090
```

O con URL completa:

```bat
backend-service.bat set-url http://192.168.1.50:8090
```

Estos comandos actualizan:
1. `deploy/backend-service.local.conf`
2. `client/config/hub-runtime.override.json`

Nota:
1. `hub-runtime.override.json` tiene prioridad sobre `hub-runtime.json`.
2. `hub-runtime.override.json` no se versiona y no se pisa en updates.

### 5.1 Despliegue rapido "un clic"

Comando recomendado para automatizar:

```bat
deploy-production.bat 192.168.1.50 8090 60
```

Flujo que ejecuta:
1. `backend-service.bat set-ip`
2. `backend-service.bat install`
3. `backend-service.bat start`
4. Health-check sobre `/api/health`

Parametros:
1. `IP_O_HOST` (obligatorio)
2. `PUERTO_BACKEND` (opcional, default `8090`)
3. `TIMEOUT_SEG` health-check (opcional, default `45`)

Nota:
1. Debe ejecutarse como Administrador.
2. Si luego quieres TLS, ejecuta `backend-service.bat enable-https ...`.
3. Si ejecutas `deploy-production.bat` sin parametros, entra en modo interactivo.
4. Genera log de despliegue para soporte TI:
   - `logs/deploy-production-YYYYMMDD-HHMMSS.log`

---

## 6) Habilitar HTTPS autofirmado (recomendado)

### 6.1 Activar HTTPS

Ejecutar:

```bat
backend-service.bat enable-https 192.168.1.50 9443
```

Que hace internamente:
1. Genera certificado autofirmado en `LocalMachine\My`.
2. Lo agrega a `LocalMachine\Root` del servidor.
3. Configura binding SSL en `http.sys` para `0.0.0.0:9443`.
4. Configura `urlacl` para el proxy HTTPS local.
5. Actualiza `BACKEND_URL` a `https://192.168.1.50:9443`.
6. Exporta certificado publico `.cer` en `deploy/certs/`.

### 6.2 Distribuir confianza del certificado a clientes

Opcion A (manual por equipo):
1. Copiar `deploy/certs/<archivo>.cer` al equipo cliente.
2. Abrir `mmc` -> `Certificates (Local Computer)` -> `Trusted Root Certification Authorities`.
3. Importar el `.cer`.

Opcion B (recomendada):
1. Distribuir por GPO en dominio AD al store de `Trusted Root`.

Sin este paso, navegador/Outlook pueden mostrar advertencias por certificado no confiable.

### 6.3 Cambio de IP o hostname

Si cambia la IP/host productiva, volver a ejecutar:

```bat
backend-service.bat enable-https NUEVA_IP_O_HOST 9443
```

Esto regenera certificado y actualiza URL.

### 6.4 Desactivar HTTPS

```bat
backend-service.bat disable-https
```

Quita binding SSL/urlacl y regresa `BACKEND_URL` a HTTP local.

---

## 7) Instalar backend como servicio nativo de Windows

Instalar/configurar:

```bat
backend-service.bat install
```

Iniciar:

```bat
backend-service.bat start
```

Estado:

```bat
backend-service.bat status
backend-service.bat show
```

Operativos:

```bat
backend-service.bat stop
backend-service.bat restart
backend-service.bat uninstall
```

Detalle tecnico:
1. `backend-service.bat install` compila (si hace falta) `deploy/CotizadorServiceHost.exe`.
2. El servicio Windows apunta a `CotizadorServiceHost.exe` (host nativo).
3. El host ejecuta `deploy/run-pocketbase-service.ps1`.
4. Con HTTPS activo:
   - PocketBase corre en HTTP interno.
   - `deploy/https-reverse-proxy.ps1` publica HTTPS para la LAN.
5. Logs:
   - `logs/pocketbase-service.log`
   - `logs/pocketbase.stdout.log`
   - `logs/pocketbase.stderr.log`
   - `logs/https-proxy.log`
   - `logs/https-proxy.stdout.log`
   - `logs/https-proxy.stderr.log`
   - `logs/service-host.log`

---

## 8) Publicar frontend

### Opcion A: IIS/Nginx/Caddy interno
1. Publicar `client/` como sitio estatico.
2. URL ejemplo:
   - `http://IP_SERVIDOR:8080/index.html`
   - o URL interna corporativa.

### Opcion B (temporal/PoC)

```powershell
cd client
python -m http.server 8080
```

---

## 9) Validaciones de produccion

### 9.1 Backend HTTPS
1. Abrir:
   - `https://IP_O_HOST:9443/api/health`
2. Debe responder sin error de certificado (si el `.cer` ya esta confiado).

### 9.2 Frontend
1. Abrir URL publicada de `client/`.
2. Iniciar sesion.
3. Verificar que consume `BACKEND_URL` desde `hub-runtime.override.json`.

### 9.3 Feed ICS
1. Abrir:
   - `https://IP_O_HOST:9443/api/cotizador/cp-calendar-ics`
2. Debe contener `BEGIN:VCALENDAR`.

---

## 10) Outlook Desktop (operacion para usuarios)

En Agenda CP del cotizador:
1. `Copiar enlace Outlook` copia la URL ICS.
2. `Abrir Outlook` intenta abrir suscripcion automatica (`webcal://`).
3. `Descargar ICS` hace export manual (con fallback local si falla endpoint).

Alta manual (si aplica):
1. Outlook -> `Calendar` -> `Add Calendar` -> `From Internet`.
2. Pegar URL ICS.
3. Confirmar suscripcion.

Comportamiento:
1. Cambios del cotizador impactan el feed ICS.
2. Outlook sincroniza segun su ciclo de refresco (no en tiempo real estricto).

---

## 11) Actualizacion de software

1. Respaldar:
   - `pb_data`, `pb_hooks`, `pb_migrations`
   - `client/config/hub-runtime.override.json`
   - `deploy/backend-service.local.conf`
   - `deploy/certs/`
2. `backend-service.bat stop`
3. Actualizar codigo del repositorio.
4. Verificar que archivos locales siguen intactos.
5. `backend-service.bat start`
6. Ejecutar validaciones de la seccion 9.

---

## 12) Rollback rapido

1. `backend-service.bat stop`
2. Restaurar respaldo completo.
3. `backend-service.bat start`
4. Validar `/api/health`, login y agenda.

---

## 13) Seguridad recomendada

1. Restringir puertos por firewall interno.
2. No exponer dashboard `/_/` fuera de redes autorizadas.
3. Mantener credenciales admin bajo control TI.
4. Respaldos cifrados y politica de retencion.
5. Distribuir certificado raiz solo a equipos autorizados.

---

## 14) Troubleshooting

1. Frontend no conecta:
   - Revisar `backend-service.bat show`.
   - Revisar `client/config/hub-runtime.override.json`.

2. Error HTTPS o certificado:
   - Verificar `backend-service.bat enable-https ...` ejecutado como Administrador.
   - Verificar confianza del `.cer` en clientes.
   - Revisar conflicto de puerto con:
     - `netsh http show sslcert`

3. Error `StartService ERROR 1053`:
   - Reinstalar para actualizar BinPath al ServiceHost nativo:
     - `backend-service.bat install`
   - Validar ruta actual:
     - `sc qc CotizadorPocketBase`
   - Debe apuntar a `deploy\CotizadorServiceHost.exe`, no a `cmd.exe /c ...`.

4. Servicio arriba pero API no responde:
   - Revisar `logs/pocketbase-service.log`.
   - Revisar `logs/pocketbase.stdout.log` y `logs/pocketbase.stderr.log`.
   - Revisar `logs/https-proxy.log`.
   - Revisar `logs/https-proxy.stderr.log`.
   - Revisar `logs/service-host.log`.
   - Ejecutar `backend-service.bat restart`.

5. ICS con error:
   - Probar URL ICS en navegador.
   - Confirmar que devuelve `BEGIN:VCALENDAR`.

6. `Abrir Outlook` no abre alta automatica:
   - Usar `Copiar enlace Outlook` y alta manual en Outlook.

7. `install` falla al compilar ServiceHost:
   - Ejecutar manual:
     - `deploy\build-service-host.bat`
   - Si reporta que no encuentra `csc.exe`, instalar/activar .NET Framework 4.x en el servidor.

---

## 15) Archivos clave para TI

1. Servicio y operacion:
   - `deploy-production.bat`
   - `run-local-stack.bat`
   - `stop-local-stack.bat`
   - `backend-service.bat`
   - `deploy/build-service-host.bat`
   - `deploy/CotizadorServiceHost.cs`
   - `deploy/static-file-server.ps1`
   - `deploy/run-pocketbase-service.bat`
   - `deploy/run-pocketbase-service.ps1`

2. HTTPS:
   - `deploy/configure-https-selfsigned.ps1`
   - `deploy/https-reverse-proxy.ps1`
   - `deploy/certs/` (local)

3. Configuracion:
   - `deploy/backend-service.local.conf` (local)
   - `client/config/hub-runtime.override.json` (local)
   - `client/config/hub-runtime.json` (base versionada)

4. Documentacion:
   - `README.md`
   - `DOCUMENTACION-CODIGO-FRONTEND-BACKEND.md`
   - este manual
