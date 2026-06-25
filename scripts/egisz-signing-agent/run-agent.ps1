# Emkaro signing agent (manual or scheduled task)
$ErrorActionPreference = "Stop"
$Root = if ($env:EMKARO_SIGNING_DIR) { $env:EMKARO_SIGNING_DIR } else { "C:\emkaro-signing" }
Set-Location $Root

$configPath = Join-Path $Root "config.env"
if (-not (Test-Path $configPath)) {
  Write-Error "Missing config.env in $Root"
}

Get-Content $configPath -Encoding UTF8 | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq "" -or $line.StartsWith("#")) { return }
  $eq = $line.IndexOf("=")
  if ($eq -lt 1) { return }
  $name = $line.Substring(0, $eq).Trim()
  $value = $line.Substring($eq + 1).Trim()
  if ($name) { Set-Item -Path "env:$name" -Value $value }
}

if (-not $env:EGISZ_SIGNING_SECRET) {
  Write-Error "EGISZ_SIGNING_SECRET is empty in config.env"
}

if (-not $env:CRYPTOPRO_CSPTEST -and -not $env:CRYPTOPRO_CRYPTCP) {
  $env:CRYPTOPRO_CSPTEST = "C:\Program Files (x86)\Crypto Pro\CSP\csptest.exe"
}

$logDir = Join-Path $Root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "agent.log"

$node = $env:NODE_EXE
if (-not $node) {
  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  $node = if ($nodeCmd) { $nodeCmd.Source } else { "C:\Program Files\nodejs\node.exe" }
}

$port = if ($env:EGISZ_SIGNING_PORT) { $env:EGISZ_SIGNING_PORT } else { "9876" }
Add-Content -Path $logFile -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') Emkaro signing agent starting on port $port"
& $node (Join-Path $Root "server.mjs") 2>&1 | Tee-Object -FilePath $logFile -Append
