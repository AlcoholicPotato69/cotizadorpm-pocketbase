param(
    [string]$RootDir = '',
    [string]$PublicDir = 'frontend\public_runtime'
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($RootDir)) {
    $RootDir = Join-Path $PSScriptRoot '..\..'
}

$RootDir = [System.IO.Path]::GetFullPath($RootDir)

$publicRoot = $PublicDir
if (-not [System.IO.Path]::IsPathRooted($publicRoot)) {
    $publicRoot = Join-Path $RootDir $publicRoot
}
$publicRoot = [System.IO.Path]::GetFullPath($publicRoot)

if (-not (Test-Path -LiteralPath $publicRoot)) {
    New-Item -ItemType Directory -Path $publicRoot -Force | Out-Null
}

$redirectHtml = @'
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="refresh" content="0; url=./client/index.html">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cotizador</title>
    <script>
        window.location.replace('./client/index.html');
    </script>
</head>
<body>
    <p>Redirigiendo a <a href="./client/index.html">client/index.html</a>...</p>
</body>
</html>
'@

Set-Content -Path (Join-Path $publicRoot 'index.html') -Value $redirectHtml -Encoding UTF8

$linkMap = @{
    'client' = (Join-Path $RootDir 'frontend\client')
    'assets' = (Join-Path $RootDir 'frontend\assets')
}

foreach ($name in $linkMap.Keys) {
    $targetPath = [System.IO.Path]::GetFullPath($linkMap[$name])
    if (-not (Test-Path -LiteralPath $targetPath -PathType Container)) {
        throw "No existe la carpeta requerida para exponer '$name': $targetPath"
    }

    $linkPath = Join-Path $publicRoot $name
    if (Test-Path -LiteralPath $linkPath) {
        $item = Get-Item -LiteralPath $linkPath -Force
        $isLink = $item.Attributes.ToString().Contains('ReparsePoint')
        if ($isLink) {
            continue
        }
        if ($item.PSIsContainer) {
            continue
        }
        throw "La ruta publica '$linkPath' ya existe y no se puede reutilizar."
    }

    New-Item -ItemType Junction -Path $linkPath -Target $targetPath | Out-Null
}

Write-Output $publicRoot
