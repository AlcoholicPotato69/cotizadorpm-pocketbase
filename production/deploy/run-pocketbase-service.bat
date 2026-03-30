@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%..\.."
for %%I in ("%ROOT_DIR%") do set "ROOT_DIR=%%~fI"

set "RUNNER_PS=%ROOT_DIR%\production\deploy\run-pocketbase-service.ps1"

if not exist "%RUNNER_PS%" (
  echo [ERROR] No existe runner PowerShell: %RUNNER_PS%
  exit /b 2
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%RUNNER_PS%" -RootDir "%ROOT_DIR%"
exit /b %ERRORLEVEL%
