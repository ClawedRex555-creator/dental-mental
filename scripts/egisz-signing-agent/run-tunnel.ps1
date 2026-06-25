# SSH reverse tunnel: server 127.0.0.1:9876 -> this PC 127.0.0.1:9876
# Only one instance should run (mutex). Skips connect if tunnel already works on server.
$ErrorActionPreference = "Continue"
$Root = if ($env:EMKARO_SIGNING_DIR) { $env:EMKARO_SIGNING_DIR } else { "C:\emkaro-signing" }
$configPath = Join-Path $Root "config.env"

if (Test-Path $configPath) {
  Get-Content $configPath -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }
    $eq = $line.IndexOf("=")
    if ($eq -lt 1) { return }
    $name = $line.Substring(0, $eq).Trim()
    $value = $line.Substring($eq + 1).Trim()
    if ($name) { Set-Item -Path "env:$name" -Value $value }
  }
}

$sshHost = if ($env:EMKARO_SSH_HOST) { $env:EMKARO_SSH_HOST } else { "root@201.51.0.171" }
$local = if ($env:TUNNEL_LOCAL_PORT) { $env:TUNNEL_LOCAL_PORT } else { "9876" }
$remote = if ($env:TUNNEL_REMOTE_PORT) { $env:TUNNEL_REMOTE_PORT } else { "9876" }
$sshPort = if ($env:EMKARO_SSH_PORT) { $env:EMKARO_SSH_PORT } else { "22" }

$logDir = Join-Path $Root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "tunnel.log"

function Write-Log($msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
  Add-Content -Path $logFile -Value $line
  Write-Host $line
}

$mutex = New-Object System.Threading.Mutex($false, "Global\EmkaroSigningTunnel")
if (-not $mutex.WaitOne(0, $false)) {
  Write-Log "Another tunnel watcher is already running. Exit."
  exit 0
}

function Test-TunnelActive {
  try {
    $out = & ssh -p $sshPort -o ConnectTimeout=5 -o BatchMode=yes -o StrictHostKeyChecking=accept-new `
      $sshHost "curl -sf -o /dev/null http://127.0.0.1:${remote}/health && echo ok" 2>$null
    return ($out -match "ok")
  } catch {
    return $false
  }
}

Write-Log "SSH tunnel watcher -> $sshHost"

while ($true) {
  if (Test-TunnelActive) {
    Write-Log "Tunnel already active on server, check again in 60s"
    Start-Sleep -Seconds 60
    continue
  }

  Write-Log "ssh -R 127.0.0.1:${remote}:127.0.0.1:${local}"
  & ssh -p $sshPort -N `
    -o ServerAliveInterval=30 `
    -o ServerAliveCountMax=3 `
    -o ExitOnForwardFailure=yes `
    -o StrictHostKeyChecking=accept-new `
    -R "127.0.0.1:${remote}:127.0.0.1:${local}" `
    $sshHost
  Write-Log "SSH exited, retry in 10s"
  Start-Sleep -Seconds 10
}
