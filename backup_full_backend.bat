@echo off
setlocal

set SCRIPT_DIR=%~dp0
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\backup_full_backend.ps1" %*
set EXIT_CODE=%ERRORLEVEL%

if %EXIT_CODE% neq 0 (
  echo.
  echo [ERROR] Backup failed.
  exit /b %EXIT_CODE%
)

echo.
echo [OK] Full backend backup completed.
exit /b 0
