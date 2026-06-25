# Run after reboot if signing is down (no admin required)
Start-ScheduledTask -TaskName EmkaroSigningAgent -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName EmkaroSigningTunnel -ErrorAction SilentlyContinue
Start-Sleep -Seconds 8
try {
  $h = Invoke-RestMethod http://127.0.0.1:9876/health -TimeoutSec 5
  Write-Host "OK: signing agent ok=$($h.ok)"
} catch {
  Write-Host "FAIL: agent not responding. Run install-windows-tasks.ps1 as Administrator."
  exit 1
}
