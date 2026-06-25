# Install Emkaro signing agent + SSH tunnel (run PowerShell as Administrator)
# Tasks run hidden (no PowerShell windows after reboot).
#   powershell -ExecutionPolicy Bypass -File "C:\emkaro-signing\install-windows-tasks.ps1"

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

if ($Root -match "egisz-signing-agent$") {
  Write-Host "Copy this folder to C:\emkaro-signing and run from there."
  exit 1
}

$configPath = Join-Path $Root "config.env"
if (-not (Test-Path $configPath)) {
  Write-Error "Missing config.env in $Root"
}

$agentScript = Join-Path $Root "run-agent.ps1"
$tunnelScript = Join-Path $Root "run-tunnel.ps1"
$launcher = Join-Path $Root "launch-hidden.vbs"
if (-not (Test-Path $agentScript)) { Write-Error "Missing run-agent.ps1" }
if (-not (Test-Path $tunnelScript)) { Write-Error "Missing run-tunnel.ps1" }
if (-not (Test-Path $launcher)) { Write-Error "Missing launch-hidden.vbs" }

$wscript = Join-Path $env:SystemRoot "System32\wscript.exe"
$actionAgent = New-ScheduledTaskAction -Execute $wscript -Argument "//B `"$launcher`" `"$agentScript`"" -WorkingDirectory $Root
$actionTunnel = New-ScheduledTaskAction -Execute $wscript -Argument "//B `"$launcher`" `"$tunnelScript`"" -WorkingDirectory $Root

$triggerLogon = New-ScheduledTaskTrigger -AtLogOn
$triggerLogon.Delay = "PT45S"

$triggerBoot = New-ScheduledTaskTrigger -AtStartup
$triggerBoot.Delay = "PT90S"

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Days 3650) `
  -Hidden

$principal = New-ScheduledTaskPrincipal `
  -UserId "$env:USERDOMAIN\$env:USERNAME" `
  -LogonType Interactive `
  -RunLevel Highest

Register-ScheduledTask -TaskName "EmkaroSigningAgent" `
  -Action $actionAgent -Trigger @($triggerLogon, $triggerBoot) -Settings $settings -Principal $principal -Force `
  -Description "Emkaro EGISZ signing agent (CryptoPro, hidden)" | Out-Null

Register-ScheduledTask -TaskName "EmkaroSigningTunnel" `
  -Action $actionTunnel -Trigger @($triggerLogon, $triggerBoot) -Settings $settings -Principal $principal -Force `
  -Description "Emkaro SSH signing tunnel to server (hidden)" | Out-Null

Write-Host ""
Write-Host "OK: hidden tasks registered (no PowerShell windows on boot)."
Write-Host ""
Write-Host "Start now:"
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$Root\start-emkaro-signing.ps1`""
Write-Host ""
Write-Host "Check: Invoke-RestMethod http://127.0.0.1:9876/health"
Write-Host "Logs:  $Root\logs\agent.log  $Root\logs\tunnel.log"
