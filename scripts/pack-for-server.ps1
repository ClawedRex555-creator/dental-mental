# Creates emkaro-deploy.zip for VPS upload (without node_modules and .next)
# Run from project root:
#   powershell -ExecutionPolicy Bypass -File scripts\pack-for-server.ps1

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

$outZip = Join-Path $root "emkaro-deploy.zip"
$staging = Join-Path $env:TEMP "emkaro-pack-$(Get-Random)"

Write-Host "Project: $root"
Write-Host "Output:  $outZip"

if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging | Out-Null

$exclude = @('node_modules', '.next', '.git', '.tools', 'emkaro-deploy.zip', '.env', '.env.local', 'tsconfig.tsbuildinfo')

Get-ChildItem -Path $root -Force | Where-Object {
  $exclude -notcontains $_.Name
} | ForEach-Object {
  Copy-Item -Path $_.FullName -Destination (Join-Path $staging $_.Name) -Recurse -Force
}

if (Test-Path $outZip) { Remove-Item $outZip -Force }
Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $outZip -CompressionLevel Optimal
Remove-Item $staging -Recurse -Force

$mb = [math]::Round((Get-Item $outZip).Length / 1MB, 1)
Write-Host ""
Write-Host "Done: $outZip ($mb MB)"
Write-Host "Upload to server /opt/ then unzip and run scripts/quick-deploy.sh"
