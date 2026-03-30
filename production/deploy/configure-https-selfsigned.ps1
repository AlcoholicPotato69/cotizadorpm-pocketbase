param(
    [Parameter(Mandatory = $true)]
    [string]$HostName,

    [int]$Port = 9443,

    [string]$ExportDir = ''
)

$ErrorActionPreference = 'Stop'

function Invoke-Netsh {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Args,
        [switch]$IgnoreErrors
    )

    $output = & netsh @Args 2>&1
    $code = $LASTEXITCODE
    if (-not $IgnoreErrors -and $code -ne 0) {
        throw "netsh $($Args -join ' ') fallo con codigo $code. Detalle: $output"
    }
    return $output
}

function New-CotizadorSelfSignedCertificate {
    param(
        [Parameter(Mandatory = $true)]
        [string]$TargetHost
    )

    $subject = "CN=$TargetHost"
    $friendly = "Cotizador HTTPS $TargetHost"
    $ext = @('2.5.29.37={text}1.3.6.1.5.5.7.3.1')

    $params = @{
        Type              = 'Custom'
        Subject           = $subject
        FriendlyName      = $friendly
        KeyAlgorithm      = 'RSA'
        KeyLength         = 2048
        HashAlgorithm     = 'SHA256'
        KeyExportPolicy   = 'Exportable'
        CertStoreLocation = 'Cert:\LocalMachine\My'
        NotAfter          = (Get-Date).AddYears(5)
        TextExtension     = $ext
    }

    if ($TargetHost -match '^\d{1,3}(\.\d{1,3}){3}$') {
        $params.TextExtension += "2.5.29.17={text}IPAddress=$TargetHost"
    } else {
        $params['DnsName'] = @($TargetHost)
    }

    return New-SelfSignedCertificate @params
}

if ([string]::IsNullOrWhiteSpace($HostName)) {
    throw 'HostName es obligatorio.'
}
if ($Port -lt 1 -or $Port -gt 65535) {
    throw "Puerto HTTPS invalido: $Port"
}

$HostName = $HostName.Trim()
$appId = '{2EBAE57E-B690-4A36-97D6-8A09EFC7D52F}'
$ipPort = "0.0.0.0:$Port"
$urlAcl = "https://+:$Port/"

$cert = New-CotizadorSelfSignedCertificate -TargetHost $HostName
$thumb = ($cert.Thumbprint -replace '\s', '').ToUpperInvariant()

# Confiar localmente en el servidor.
$serverRoot = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root', 'LocalMachine')
$serverRoot.Open('ReadWrite')
try {
    $alreadyTrusted = $serverRoot.Certificates | Where-Object { $_.Thumbprint -eq $thumb } | Select-Object -First 1
    if (-not $alreadyTrusted) {
        $serverRoot.Add($cert)
    }
} finally {
    $serverRoot.Close()
}

$certFile = ''
if (-not [string]::IsNullOrWhiteSpace($ExportDir)) {
    $safeHost = ($HostName -replace '[^A-Za-z0-9\.-]', '_')
    New-Item -ItemType Directory -Path $ExportDir -Force | Out-Null
    $certFile = Join-Path $ExportDir ("cotizador-https-{0}-{1}.cer" -f $safeHost, $Port)
    Export-Certificate -Cert $cert -FilePath $certFile -Force | Out-Null
}

Invoke-Netsh -Args @('http', 'delete', 'sslcert', "ipport=$ipPort") -IgnoreErrors | Out-Null
Invoke-Netsh -Args @('http', 'add', 'sslcert', "ipport=$ipPort", "certhash=$thumb", "appid=$appId", 'certstorename=MY') | Out-Null

Invoke-Netsh -Args @('http', 'delete', 'urlacl', "url=$urlAcl") -IgnoreErrors | Out-Null
Invoke-Netsh -Args @('http', 'add', 'urlacl', "url=$urlAcl", 'user=NT AUTHORITY\SYSTEM') | Out-Null

Write-Output "HTTPS_CERT_THUMBPRINT=$thumb"
Write-Output "HTTPS_CERT_FILE=$certFile"
Write-Output "HTTPS_URL=https://${HostName}:$Port"
