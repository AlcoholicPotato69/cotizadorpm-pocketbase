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

    # ─── HEADERS DE SEGURIDAD HTTP ────────────────────────────────────────────
    # Previene clickjacking (tu app no debe mostrarse en iframes externos)
    add_header X-Frame-Options "DENY" always;
    # Previene MIME sniffing (el navegador respeta el Content-Type declarado)
    add_header X-Content-Type-Options "nosniff" always;
    # Controla información que se envía en el Referer al navegar
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    # Habilita XSS filter del navegador (capa extra, complementa CSP)
    add_header X-XSS-Protection "1; mode=block" always;
    # Permissions Policy: desactiva features sensibles no usadas por la app
    add_header Permissions-Policy "geolocation=(), camera=(), microphone=(), payment=()" always;
    # Content Security Policy: Define fuentes de contenido permitidas
    # AJUSTA 'default-src' si usas CDNs externos en producción.
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';" always;
    # HSTS: Fuerza HTTPS por 1 año (activa solo si tienes SSL configurado)
    # add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

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
        # Headers de seguridad para respuestas de la API
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "DENY" always;
    }

    # ─── PANEL ADMIN POCKETBASE ───────────────────────────────────────────────
    # SEGURIDAD: Restringir acceso al panel admin SOLO a IPs de confianza.
    # Agrega aquí las IPs de los administradores del sistema.
    # Si no necesitas acceso remoto al panel, elimina este bloque completamente.
    location /_/ {
        # REEMPLAZA con la IP real de tu equipo de administración:
        allow 127.0.0.1;
        # allow 203.0.113.10;  # Ejemplo: IP pública del administrador
        deny all;

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
