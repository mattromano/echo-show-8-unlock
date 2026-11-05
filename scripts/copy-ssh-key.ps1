# Copies this PC's public SSH key to a Pi so later logins need no password.
# You type the Pi's password once when ssh asks for it.
# Usage: scripts\copy-ssh-key.ps1 -User 8gigapi -HostIp 192.168.4.98
param([Parameter(Mandatory)] [string]$User, [Parameter(Mandatory)] [string]$HostIp,
      [string]$Key = "$env:USERPROFILE\.ssh\id_ed25519.pub")
Get-Content $Key | ssh -o StrictHostKeyChecking=accept-new "$User@$HostIp" "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys && echo KEY-INSTALLED"
