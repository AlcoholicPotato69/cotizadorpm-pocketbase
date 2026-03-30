param(
    [int]$ListenPort = 9443,
    [string]$TargetBaseUrl = 'http://127.0.0.1:8090',
    [string]$LogFile = ''
)

$ErrorActionPreference = 'Stop'

function Write-ProxyLog {
    param([string]$Message)
    if ([string]::IsNullOrWhiteSpace($LogFile)) {
        return
    }
    $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Add-Content -Path $LogFile -Value $line
}

function Copy-HeadersToProxyRequest {
    param(
        [Parameter(Mandatory = $true)] [System.Net.HttpListenerRequest]$Request,
        [Parameter(Mandatory = $true)] [System.Net.Http.HttpRequestMessage]$ProxyRequest,
        [System.Net.Http.HttpContent]$Content
    )

    $skip = @(
        'Host',
        'Connection',
        'Content-Length',
        'Expect',
        'Upgrade',
        'Proxy-Connection',
        'Transfer-Encoding'
    )

    foreach ($key in $Request.Headers.AllKeys) {
        if ($skip -contains $key) {
            continue
        }

        $values = $Request.Headers.GetValues($key)
        if (-not $values) {
            continue
        }

        if ($key -like 'Content-*' -and $null -ne $Content) {
            $null = $Content.Headers.TryAddWithoutValidation($key, $values)
        } else {
            $null = $ProxyRequest.Headers.TryAddWithoutValidation($key, $values)
        }
    }
}

function Copy-HeadersToListenerResponse {
    param(
        [Parameter(Mandatory = $true)] [System.Net.Http.HttpResponseMessage]$ProxyResponse,
        [Parameter(Mandatory = $true)] [System.Net.HttpListenerResponse]$ListenerResponse
    )

    $skip = @(
        'Transfer-Encoding',
        'Connection',
        'Keep-Alive',
        'Proxy-Connection',
        'Content-Length',
        'Content-Type',
        'Date',
        'Server'
    )

    foreach ($pair in $ProxyResponse.Headers) {
        if ($skip -contains $pair.Key) {
            continue
        }
        try {
            $ListenerResponse.Headers.Add($pair.Key, ($pair.Value -join ','))
        } catch {
            # Algunos headers son restringidos por HttpListener, se ignoran.
        }
    }

    foreach ($pair in $ProxyResponse.Content.Headers) {
        if ($skip -contains $pair.Key) {
            continue
        }
        try {
            $ListenerResponse.Headers.Add($pair.Key, ($pair.Value -join ','))
        } catch {
            # Algunos headers son restringidos por HttpListener, se ignoran.
        }
    }

    if ($ProxyResponse.Content.Headers.ContentType) {
        $ListenerResponse.ContentType = $ProxyResponse.Content.Headers.ContentType.ToString()
    }
    if ($ProxyResponse.Content.Headers.ContentLength -ge 0) {
        $ListenerResponse.ContentLength64 = [int64]$ProxyResponse.Content.Headers.ContentLength
    } else {
        $ListenerResponse.SendChunked = $true
    }
}

if ($ListenPort -lt 1 -or $ListenPort -gt 65535) {
    throw "ListenPort invalido: $ListenPort"
}
if ([string]::IsNullOrWhiteSpace($TargetBaseUrl)) {
    throw 'TargetBaseUrl es obligatorio.'
}

$targetBase = $TargetBaseUrl.Trim().TrimEnd('/')
$listenPrefix = "https://+:$ListenPort/"

$handler = [System.Net.Http.HttpClientHandler]::new()
$handler.AllowAutoRedirect = $false
$handler.UseCookies = $false
$httpClient = [System.Net.Http.HttpClient]::new($handler)
$httpClient.Timeout = [TimeSpan]::FromMinutes(10)

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($listenPrefix)
$listener.Start()
Write-ProxyLog "Proxy HTTPS iniciado en $listenPrefix -> $targetBase"

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        try {
            $targetUrl = $targetBase + $request.RawUrl
            $targetUri = [Uri]::new($targetUrl)
            $method = [System.Net.Http.HttpMethod]::new($request.HttpMethod)
            $proxyRequest = [System.Net.Http.HttpRequestMessage]::new($method, $targetUri)

            $content = $null
            if ($request.HasEntityBody) {
                $memory = [System.IO.MemoryStream]::new()
                try {
                    $request.InputStream.CopyTo($memory)
                    $content = [System.Net.Http.ByteArrayContent]::new($memory.ToArray())
                } finally {
                    $memory.Dispose()
                }
            }

            if ($null -ne $content) {
                $proxyRequest.Content = $content
                if ($request.ContentType) {
                    $null = $proxyRequest.Content.Headers.TryAddWithoutValidation('Content-Type', $request.ContentType)
                }
            }

            Copy-HeadersToProxyRequest -Request $request -ProxyRequest $proxyRequest -Content $content

            $proxyResponse = $httpClient.SendAsync($proxyRequest, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
            try {
                $response.StatusCode = [int]$proxyResponse.StatusCode
                if (-not [string]::IsNullOrWhiteSpace($proxyResponse.ReasonPhrase)) {
                    $response.StatusDescription = $proxyResponse.ReasonPhrase
                }

                Copy-HeadersToListenerResponse -ProxyResponse $proxyResponse -ListenerResponse $response

                $proxyStream = $proxyResponse.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
                try {
                    $proxyStream.CopyTo($response.OutputStream)
                } finally {
                    $proxyStream.Dispose()
                }
            } finally {
                $proxyResponse.Dispose()
                $proxyRequest.Dispose()
            }
        } catch {
            $response.StatusCode = 502
            $response.ContentType = 'application/json; charset=utf-8'
            $bytes = [System.Text.Encoding]::UTF8.GetBytes('{"message":"HTTPS proxy error","status":502}')
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            Write-ProxyLog ("Error proxy: " + $_.Exception.Message)
        } finally {
            $response.OutputStream.Close()
            $response.Close()
        }
    }
} finally {
    if ($listener.IsListening) {
        $listener.Stop()
    }
    $listener.Close()
    $httpClient.Dispose()
    $handler.Dispose()
    Write-ProxyLog 'Proxy HTTPS detenido.'
}
