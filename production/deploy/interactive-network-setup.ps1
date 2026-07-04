param(
    [string]$ConfFile = "$PSScriptRoot\server-network.conf",
    [switch]$Force
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

if (-not $Force -and (Test-Path $ConfFile)) {
    Write-Host "[INFO] Configuración existente encontrada en $ConfFile. Reconfigurando..." -ForegroundColor Cyan
}

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  CONFIGURACIÓN INTERACTIVA DE RED (PRODUCCIÓN)" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Cyan

$ips = @()
$ips += [PSCustomObject]@{ Index = 1; IP = "127.0.0.1"; Name = "Loopback (Solo acceso local)" }

$index = 2
try {
    $netIPs = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | 
              Where-Object { $_.IPAddress -ne "127.0.0.1" -and $_.IPAddress -ne "0.0.0.0" -and $_.IPAddress -notlike "169.254.*" } | 
              Sort-Object InterfaceAlias
    foreach ($item in $netIPs) {
        $ips += [PSCustomObject]@{ Index = $index; IP = $item.IPAddress; Name = $item.InterfaceAlias }
        $index++
    }
} catch {}

Write-Host "`nIPs disponibles en este servidor:" -ForegroundColor White
foreach ($item in $ips) {
    Write-Host "  [$($item.Index)] $($item.IP) " -NoNewline -ForegroundColor Green
    Write-Host "- $($item.Name)" -ForegroundColor Gray
}
Write-Host "  [$index] Ingresar una IP o Dominio manualmente..." -ForegroundColor Yellow
Write-Host "  [0] 0.0.0.0 - Escuchar en TODAS las interfaces de red" -ForegroundColor Magenta

$selectedIP = ""
$bindIP = ""

while ($true) {
    $choice = Read-Host "`nSelecciona el número de la opción de red [0-$index]"
    if ($choice -eq "0") {
        $bindIP = "0.0.0.0"
        Write-Host "`nHas seleccionado escuchar en 0.0.0.0 (todas las interfaces)." -ForegroundColor Cyan
        $selectedIP = Read-Host "Escribe la IP principal o dominio exterior por el que accederán los usuarios [ej: 192.168.1.50]"
        if (-not $selectedIP) { $selectedIP = "127.0.0.1" }
        break
    }
    elseif ($choice -eq [string]$index) {
        $custom = Read-Host "`nEscribe la IP o dominio del servidor manualmente [ej: miservidor.com o 192.168.1.100]"
        if ($custom) {
            $selectedIP = $custom.Trim()
            $bindIP = $selectedIP
            break
        }
    }
    else {
        $found = $ips | Where-Object { [string]$_.Index -eq $choice }
        if ($found) {
            $selectedIP = $found.IP
            $bindIP = $selectedIP
            break
        }
    }
    Write-Host "Opción no válida. Por favor, elige un número de la lista." -ForegroundColor Red
}

Write-Host "`n--- Configuración de Puertos ---" -ForegroundColor Yellow
$backendPort = Read-Host "Puerto para el Backend / API de PocketBase [Por defecto: 8090]"
if (-not $backendPort) { $backendPort = "8090" }

$frontendPort = Read-Host "Puerto para el Frontend [Por defecto: mismo que el backend ($backendPort)]"
if (-not $frontendPort) { $frontendPort = $backendPort }

$backendUrl = "http://${selectedIP}:${backendPort}"
if ($backendPort -eq "80") { $backendUrl = "http://${selectedIP}" }

$frontendOrigin = "http://${selectedIP}:${frontendPort}"
if ($frontendPort -eq "80") { $frontendOrigin = "http://${selectedIP}" }

$content = @(
    "BIND_IP=$bindIP"
    "SELECTED_IP=$selectedIP"
    "BACKEND_PORT=$backendPort"
    "FRONTEND_PORT=$frontendPort"
    "BACKEND_URL=$backendUrl"
    "FRONTEND_ORIGIN=$frontendOrigin"
) -join "`r`n"

Set-Content -Path $ConfFile -Value $content -Encoding ASCII -Force
Write-Host "`n[OK] Configuración guardada en $ConfFile:" -ForegroundColor Green
Write-Host "     - Bind PocketBase: ${bindIP}:${backendPort}" -ForegroundColor Gray
Write-Host "     - Backend URL:     $backendUrl" -ForegroundColor Gray
Write-Host "     - Frontend Origin: $frontendOrigin" -ForegroundColor Gray
Write-Host "============================================================`n" -ForegroundColor Cyan
