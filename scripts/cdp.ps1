# Sends one or more Chrome DevTools Protocol commands to a WebView page on the Echo and prints the replies.
# Needs: adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
# Usage: scripts\cdp.ps1 -Match peacocktv -CommandsFile cmds.json   (a JSON array of {method, params})
# -HoldSeconds keeps the session open afterwards (scripts added with Page.addScriptToEvaluateOnNewDocument
# only apply while the session that added them is connected).
param([string]$Match = 'index.html', [Parameter(Mandatory)] [string]$CommandsFile, [int]$Port = 9222, [int]$HoldSeconds = 0)
$ErrorActionPreference = 'Stop'
$Commands = [IO.File]::ReadAllText($CommandsFile)
$page = (Invoke-RestMethod "http://127.0.0.1:$Port/json") | Where-Object { $_.type -eq 'page' -and $_.url -match $Match } | Select-Object -First 1
if (-not $page) { throw "No page matching '$Match'" }
$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ct = [Threading.CancellationToken]::None
$ws.ConnectAsync([Uri]$page.webSocketDebuggerUrl, $ct).Wait()
$buf = New-Object byte[] 4194304
$id = 0
foreach ($cmd in ($Commands | ConvertFrom-Json)) {
    $id++
    $msg = @{ id = $id; method = $cmd.method; params = $cmd.params } | ConvertTo-Json -Depth 10 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($msg)
    $ws.SendAsync([ArraySegment[byte]]$bytes, 'Text', $true, $ct).Wait()
    while ($true) {
        $sb = New-Object Text.StringBuilder
        do {
            $r = $ws.ReceiveAsync([ArraySegment[byte]]$buf, $ct).Result
            [void]$sb.Append([Text.Encoding]::UTF8.GetString($buf, 0, $r.Count))
        } while (-not $r.EndOfMessage)
        $reply = $sb.ToString() | ConvertFrom-Json
        if ($reply.id -eq $id) {
            "<< $($cmd.method): " + ($reply | ConvertTo-Json -Depth 8 -Compress)
            break
        }
    }
}
if ($HoldSeconds -gt 0) {
    # Drain events while holding so the socket buffer doesn't stall the page.
    $end = (Get-Date).AddSeconds($HoldSeconds)
    while ((Get-Date) -lt $end) {
        $t = $ws.ReceiveAsync([ArraySegment[byte]]$buf, $ct)
        [void]$t.Wait([Math]::Max(100, [int]($end - (Get-Date)).TotalMilliseconds))
    }
}
$ws.Dispose()
