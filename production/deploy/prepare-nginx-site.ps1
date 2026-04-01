param(
    [string]$RootDir = '',
    [string]$SiteDir = 'production\deploy\nginx-site'
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($RootDir)) {
    $RootDir = Join-Path $PSScriptRoot '..\..'
}
$RootDir = [System.IO.Path]::GetFullPath($RootDir)

$siteRoot = $SiteDir
if (-not [System.IO.Path]::IsPathRooted($siteRoot)) {
    $siteRoot = Join-Path $RootDir $siteRoot
}
$siteRoot = [System.IO.Path]::GetFullPath($siteRoot)

if (-not (Test-Path -LiteralPath $siteRoot)) {
    New-Item -ItemType Directory -Path $siteRoot -Force | Out-Null
}

function Invoke-RoboMirror {
    param(
        [string]$SourceDir,
        [string]$DestinationDir
    )

    if (-not (Test-Path -LiteralPath $SourceDir -PathType Container)) {
        throw "No existe la carpeta de origen: $SourceDir"
    }

    if (-not (Test-Path -LiteralPath $DestinationDir)) {
        New-Item -ItemType Directory -Path $DestinationDir -Force | Out-Null
    }

    & robocopy $SourceDir $DestinationDir /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) {
        throw "robocopy fallo al sincronizar '$SourceDir' -> '$DestinationDir' (exit $LASTEXITCODE)"
    }
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

Set-Content -LiteralPath (Join-Path $siteRoot 'index.html') -Value $redirectHtml -Encoding UTF8

Invoke-RoboMirror -SourceDir (Join-Path $RootDir 'frontend\client') -DestinationDir (Join-Path $siteRoot 'client')
Invoke-RoboMirror -SourceDir (Join-Path $RootDir 'frontend\assets') -DestinationDir (Join-Path $siteRoot 'assets')

Write-Output ('NGINX_SITE_DIR=' + $siteRoot)
