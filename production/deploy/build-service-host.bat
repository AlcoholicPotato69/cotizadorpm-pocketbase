@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

set "SRC=%SCRIPT_DIR%\CotizadorServiceHost.cs"
set "OUT=%SCRIPT_DIR%\CotizadorServiceHost.exe"
set "CSC64=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
set "CSC32=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
set "CSC="

if exist "%CSC64%" set "CSC=%CSC64%"
if not defined CSC if exist "%CSC32%" set "CSC=%CSC32%"

if not exist "%SRC%" (
  echo [ERROR] No existe archivo fuente: %SRC%
  exit /b 2
)

if not defined CSC (
  echo [ERROR] No se encontro compilador C# csc.exe en .NET Framework.
  exit /b 3
)

echo [INFO] Compilando ServiceHost...
"%CSC%" /nologo /target:exe /optimize+ /out:"%OUT%" /reference:System.ServiceProcess.dll "%SRC%"
if errorlevel 1 (
  echo [ERROR] Fallo compilacion del ServiceHost.
  exit /b 4
)

if not exist "%OUT%" (
  echo [ERROR] No se genero: %OUT%
  exit /b 5
)

echo [OK] ServiceHost compilado: %OUT%
exit /b 0
