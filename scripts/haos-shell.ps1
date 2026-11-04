# Runs commands on the Home Assistant OS host (debug SSH, port 22222).
# HAOS forces logins into the interactive `ha` console, so this opens a PTY session,
# types `login` to reach the host shell, then types each command with pauses.
# Usage: scripts\haos-shell.ps1 -Commands 'docker ps -a','ha core info'
param([Parameter(Mandatory)] [string[]]$Commands, [string]$HostIp = '192.168.4.36', [int]$WaitSec = 4)

$psi = New-Object Diagnostics.ProcessStartInfo 'ssh.exe'
$psi.Arguments = "-tt -i `"$env:USERPROFILE\.ssh\id_rsa_haos`" -o BatchMode=yes -o ConnectTimeout=10 " +
    "-o PubkeyAcceptedAlgorithms=+ssh-rsa -o HostkeyAlgorithms=+ssh-rsa -p 22222 root@$HostIp"
$psi.UseShellExecute = $false
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$p = [Diagnostics.Process]::Start($psi)
$out = New-Object Text.StringBuilder
$null = Register-ObjectEvent -InputObject $p -EventName OutputDataReceived -Action { [void]$Event.MessageData.AppendLine($EventArgs.Data) } -MessageData $out
$null = Register-ObjectEvent -InputObject $p -EventName ErrorDataReceived -Action { [void]$Event.MessageData.AppendLine($EventArgs.Data) } -MessageData $out
$p.BeginOutputReadLine(); $p.BeginErrorReadLine()

function Send($line, $wait) { $p.StandardInput.Write("$line`n"); $p.StandardInput.Flush(); Start-Sleep -Seconds $wait }
Start-Sleep -Seconds 6          # let the ha console start
Send 'login' 4
foreach ($c in $Commands) { Send $c $WaitSec }
Send 'exit' 2
Send 'exit' 2
if (-not $p.HasExited) { $p.Kill() }
Get-EventSubscriber | Unregister-Event
($out.ToString() -replace '\x1b\[[0-9;?]*[A-Za-z]', '' -replace '\x1b\][^\a]*\a', '' -replace "`r", '') -split "`n" |
    Where-Object { $_.Trim() }
