@echo off
setlocal

set SCRIPT_DIR=%~dp0
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\run_full_smoke_tests.ps1" %*
set EXIT_CODE=%ERRORLEVEL%

if %EXIT_CODE% neq 0 (
  echo.
  echo [ERROR] Smoke tests failed.
  exit /b %EXIT_CODE%
)

echo.
echo [OK] Smoke tests passed.
exit /b 0
