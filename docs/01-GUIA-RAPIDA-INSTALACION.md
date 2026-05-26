# Guía Rápida: Instalación, Configuración y Despliegue

Esta guía condensa todos los comandos operativos para poner a correr el entorno desde cero. Las configuraciones más robustas pueden requerir el Nginx proxy.

## 1. Requisitos para el host

- Servidor Windows (preferiblemente de arquitectura x64 como Windows Server 2019/2022 o Windows 10/11 Profesional).
- Framework .NET 4.0+ activo (viene por defecto en Windows, es usado para el wrapper del servicio).
- Navegador moderno compatible con Vanilla JS ECMAScript (ES6).

## 2. Desarrollo (Local)

Al trabajar localmente en la máquina no necesitamos activar el servicio de Windows, ni reverse proxys de Nginx. Solo levantaremos los dos ejes de la arquitectura con los .bat de utilidad.

1. Abre tu terminal.
2. Posiciónate en la carpeta raíz del proyecto.
3. Para la base de datos (Backend):
   ```cmd
   .\development\dev-start.bat
   ```
   *Esto lanzará el servidor pocketbase oficial con el `publicDir` apuntando a `pb_public` vacío en modo live.*

4. Abre otra terminal, igual desde la raíz.
5. Para el servidor estático UI (Frontend):
   ```cmd
   .\development\frontend-dev-start.bat
   ```

*Ingresa a `http://127.0.0.1:8080/client/index.html`*

## 3. Producción (Despliegue de Servicio en Windows)

Cuando estamos listos para dejar el servidor 24/7 funcionando, instalaremos PocketBase en el Gestor de Servicios de Windows para que inicie de forma transparente y recupere su estado post-apagones:

1. Abrir terminal de **Administrador**.
2. Lanzar el asistente macro:
   ```cmd
   .\production\levantar-todo.bat
   ```
3. Introducir IP, hostname deseados cuando la CLI del script pause.
4. El script preparará `frontend/client/config/hub-runtime.json` y `env.js` para incrustar esta IP, para que el frontend resuelva las APIS a este backend dinámico.

**¿Problemas? ¿Cómo verificar que funcionó?**
Puedes lanzar el comando de diagnostico manual:
```cmd
.\production\backend-service.bat status
```
Debe indicar que el estado es `RUNNING`. Adicionalmente, dirígete en tu navegador a `http://TU_IP:TU_PUERTO/api/health`. Debes recibir una respuesta JSON confirmando latido (200 OK).

## 4. Reinstalaciones / Reconfiguración

Si decides alterar los puertos o la IP en un futuro:
```cmd
.\production\backend-service.bat stop
.\production\backend-service.bat set-ip 10.0.0.55 8090
.\production\backend-service.bat sync-frontend
.\production\backend-service.bat start
```
