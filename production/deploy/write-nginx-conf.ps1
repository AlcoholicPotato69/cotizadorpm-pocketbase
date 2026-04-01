param(
    [string]$RootDir = '',
    [string]$SiteDir = 'production\deploy\nginx-site',
    [string]$BackendUrl = 'http://127.0.0.1:8090',
    [string]$ServerName = '_',
    [string]$OutputPath = 'production\deploy\nginx\cotizador-production.conf'
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($RootDir)) {
    $RootDir = Join-Path $PSScriptRoot '..\..'
}
$RootDir = [System.IO.Path]::GetFullPath($RootDir)

function Resolve-FullPath {
    param(
        [string]$BaseDir,
        [string]$PathValue
    )

    $candidate = $PathValue
    if (-not [System.IO.Path]::IsPathRooted($candidate)) {
        $candidate = Join-Path $BaseDir $candidate
    }

    return [System.IO.Path]::GetFullPath($candidate)
}

$siteRoot = Resolve-FullPath -BaseDir $RootDir -PathValue $SiteDir
$outputFile = Resolve-FullPath -BaseDir $RootDir -PathValue $OutputPath
$outputDir = Split-Path -Parent $outputFile

if (-not (Test-Path -LiteralPath $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

try {
    $backendUri = [Uri]$BackendUrl
} catch {
    throw "BACKEND_URL invalido para Nginx: $BackendUrl"
}

$backendOrigin = $backendUri.GetLeftPart([System.UriPartial]::Authority)
$siteRootNginx = $siteRoot.Replace('\', '/')

$nginxConf = @"
# Generado por production\backend-service.bat prepare-nginx
server {
    listen 80;
    server_name $ServerName;

    root "$siteRootNginx";
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass $backendOrigin/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /_/ {
        proxy_pass $backendOrigin/_/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
"@

Set-Content -LiteralPath $outputFile -Value $nginxConf -Encoding UTF8

Write-Output ('NGINX_CONF=' + $outputFile)
