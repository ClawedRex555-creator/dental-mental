# Generate and sync EGISZ_SIGNING_SECRET (Windows config.env + server .env)
$ErrorActionPreference = "Stop"
$configPath = "C:\emkaro-signing\config.env"
if (-not (Test-Path $configPath)) { throw "Missing $configPath" }

$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$secret = [BitConverter]::ToString($bytes).Replace("-", "").ToLower()

$content = Get-Content $configPath -Raw -Encoding UTF8
if ($content -match 'EGISZ_SIGNING_SECRET=') {
  $content = $content -replace 'EGISZ_SIGNING_SECRET=.*', "EGISZ_SIGNING_SECRET=$secret"
} else {
  $content = $content.TrimEnd() + "`nEGISZ_SIGNING_SECRET=$secret`n"
}
[System.IO.File]::WriteAllText($configPath, $content, [System.Text.UTF8Encoding]::new($false))

$tmp = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($tmp, "EGISZ_SIGNING_SECRET=$secret`n", [System.Text.UTF8Encoding]::new($false))

scp $tmp root@201.51.0.171:/tmp/egisz-secret.env
Remove-Item $tmp -Force

ssh root@201.51.0.171 "grep -v '^EGISZ_SIGNING_SECRET=' /opt/emkaro/.env > /tmp/env.new && cat /tmp/egisz-secret.env >> /tmp/env.new && mv /tmp/env.new /opt/emkaro/.env && rm -f /tmp/egisz-secret.env && python3 /opt/emkaro/scripts/fix-server-env.py /opt/emkaro/.env && python3 /opt/emkaro/scripts/fix-server-env.py --check /opt/emkaro/.env && cd /opt/emkaro && docker compose up -d --force-recreate app caddy && echo ROTATE_OK"

Write-Host "New EGISZ_SIGNING_SECRET written to C:\emkaro-signing\config.env and server .env"
Write-Host "Restart signing agent: Stop-Process -Name node -ErrorAction SilentlyContinue; Start-ScheduledTask EmkaroSigningAgent"
