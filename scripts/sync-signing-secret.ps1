# Sync EGISZ_SIGNING_SECRET from C:\emkaro-signing\config.env to server .env
# Usage: powershell -ExecutionPolicy Bypass -File scripts\sync-signing-secret.ps1
$ErrorActionPreference = "Stop"
$configPath = "C:\emkaro-signing\config.env"
if (-not (Test-Path $configPath)) { throw "Missing $configPath" }

$secret = $null
Get-Content $configPath -Encoding UTF8 | ForEach-Object {
  if ($_ -match '^\s*EGISZ_SIGNING_SECRET=(.+)$') { $secret = $Matches[1].Trim() }
}
if (-not $secret -or $secret.Length -lt 32) { throw "Invalid EGISZ_SIGNING_SECRET in config.env" }

$tmp = [System.IO.Path]::GetTempFileName()
Set-Content $tmp "EGISZ_SIGNING_SECRET=$secret" -Encoding ASCII -NoNewline
Add-Content $tmp "" -Encoding ASCII

scp $tmp root@201.51.0.171:/tmp/egisz-secret.env
Remove-Item $tmp -Force

ssh root@201.51.0.171 @'
set -e
grep -v "^EGISZ_SIGNING_SECRET=" /opt/emkaro/.env > /tmp/env.new
cat /tmp/egisz-secret.env >> /tmp/env.new
mv /tmp/env.new /opt/emkaro/.env
rm -f /tmp/egisz-secret.env
python3 /opt/emkaro/scripts/fix-server-env.py /opt/emkaro/.env
python3 /opt/emkaro/scripts/fix-server-env.py --check /opt/emkaro/.env
cd /opt/emkaro && docker compose up -d --force-recreate app caddy
echo SYNC_OK
'@

Write-Host "Secret synced to server. Restart signing agent on Windows if it was running."
