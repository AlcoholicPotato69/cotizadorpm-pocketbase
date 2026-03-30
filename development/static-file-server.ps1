param(
    [string]$RootDir = '',
    [string]$BindHost = '127.0.0.1',
    [int]$Port = 8080,
    [string]$LogFile = ''
)

$ErrorActionPreference = 'Stop'

function Write-StaticLog {
    param([string]$Message)
    if ([string]::IsNullOrWhiteSpace($LogFile)) {
        return
    }
    $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Add-Content -Path $LogFile -Value $line
}

if ([string]::IsNullOrWhiteSpace($RootDir)) {
    $RootDir = Join-Path $PSScriptRoot '..\frontend'
}
$RootDir = [System.IO.Path]::GetFullPath($RootDir)

if (-not (Test-Path $RootDir)) {
    throw "No existe RootDir: $RootDir"
}
if ($Port -lt 1 -or $Port -gt 65535) {
    throw "Puerto invalido: $Port"
}

$prefix = "http://$BindHost`:$Port/"
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
$listener.Start()

Write-StaticLog "Static server iniciado en $prefix (root: $RootDir)"

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.htm'  = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.gif'  = 'image/gif'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
    '.woff' = 'font/woff'
    '.woff2' = 'font/woff2'
    '.ttf'  = 'font/ttf'
    '.map'  = 'application/json; charset=utf-8'
    '.txt'  = 'text/plain; charset=utf-8'
}

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response

        try {
            $sendBody = -not [string]::Equals($req.HttpMethod, 'HEAD', [System.StringComparison]::OrdinalIgnoreCase)
            $rawPath = [Uri]::UnescapeDataString($req.Url.AbsolutePath)
            if ([string]::IsNullOrWhiteSpace($rawPath) -or $rawPath -eq '/') {
                $rawPath = '/index.html'
            }
            if ($rawPath.StartsWith('/')) {
                $rawPath = $rawPath.Substring(1)
            }

            $safePath = $rawPath -replace '/', '\'
            if ($safePath.Contains('..')) {
                $res.StatusCode = 400
                $bytes = [System.Text.Encoding]::UTF8.GetBytes('Bad request')
                if ($sendBody) { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
                continue
            }

            $fullPath = Join-Path $RootDir $safePath
            if (Test-Path $fullPath -PathType Container) {
                $fullPath = Join-Path $fullPath 'index.html'
            }

            if (-not (Test-Path $fullPath -PathType Leaf)) {
                $res.StatusCode = 404
                $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not found')
                if ($sendBody) { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
                continue
            }

            $ext = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
            if ($mime.ContainsKey($ext)) {
                $res.ContentType = $mime[$ext]
            } else {
                $res.ContentType = 'application/octet-stream'
            }

            $data = [System.IO.File]::ReadAllBytes($fullPath)
            $res.StatusCode = 200
            $res.ContentLength64 = $data.Length
            if ($sendBody) { $res.OutputStream.Write($data, 0, $data.Length) }
        } catch {
            $res.StatusCode = 500
            Write-StaticLog ("Error: " + $_.Exception.Message)
            try {
                $bytes = [System.Text.Encoding]::UTF8.GetBytes('Server error')
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
            } catch {}
        } finally {
            $res.OutputStream.Close()
            $res.Close()
        }
    }
} finally {
    if ($listener.IsListening) {
        $listener.Stop()
    }
    $listener.Close()
    Write-StaticLog 'Static server detenido.'
}
