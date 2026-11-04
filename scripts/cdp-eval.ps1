# Evaluates a JavaScript expression in a WebView page on the Echo via the Chrome DevTools Protocol.
# Needs: adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
# Usage: scripts\cdp-eval.ps1 -Match 'index.html' -Expr 'navigator.userAgent'
param([string]$Match = 'index.html', [Parameter(Mandatory)] [string]$Expr, [int]$Port = 9222)
$ErrorActionPreference = 'Stop'
$page = (Invoke-RestMethod "http://127.0.0.1:$Port/json") | Where-Object { $_.type -eq 'page' -and $_.url -match $Match } | Select-Object -First 1
if (-not $page) { throw "No page matching '$Match'" }
$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ct = [Threading.CancellationToken]::None
$ws.ConnectAsync([Uri]$page.webSocketDebuggerUrl, $ct).Wait()
$msg = @{ id = 1; method = 'Runtime.evaluate'; params = @{ expression = $Expr; returnByValue = $true; awaitPromise = $true; userGesture = $true } } | ConvertTo-Json -Depth 5 -Compress
$bytes = [Text.Encoding]::UTF8.GetBytes($msg)
$ws.SendAsync([ArraySegment[byte]]$bytes, 'Text', $true, $ct).Wait()
$buf = New-Object byte[] 1048576; $sb = New-Object Text.StringBuilder
do {
    $r = $ws.ReceiveAsync([ArraySegment[byte]]$buf, $ct).Result
    [void]$sb.Append([Text.Encoding]::UTF8.GetString($buf, 0, $r.Count))
} while (-not $r.EndOfMessage)
$ws.Dispose()
$res = $sb.ToString() | ConvertFrom-Json
if ($res.result.exceptionDetails) { "EXCEPTION: $($res.result.exceptionDetails.exception.description)" }
else { $res.result.result.value | ConvertTo-Json -Depth 6 }
