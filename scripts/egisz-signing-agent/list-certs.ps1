# List CryptoPro SHA1 thumbprints (ASCII-only script for Windows code pages)
$certmgr = "C:\Program Files\Crypto Pro\CSP\certmgr.exe"
if (-not (Test-Path $certmgr)) {
  Write-Error "certmgr.exe not found"
  exit 1
}

Write-Host "=== CryptoPro certificates (uMy) ==="
Write-Host ""

$raw = & $certmgr -list -store uMy 2>&1 | Out-String
foreach ($block in ($raw -split '(?=\r?\n\d+-------)')) {
  if ($block -notmatch 'SHA1') { continue }
  $thumb = [regex]::Match($block, 'SHA1[^\r\n:]*:\s*([0-9a-fA-F]{40})').Groups[1].Value.ToUpper()
  if (-not $thumb) { continue }
  $lines = $block -split '\r?\n' | Where-Object { $_ -match ':\s*.+' }
  $subject = ($lines | Where-Object { $_ -notmatch 'SHA1|URL|OCSP|Serial|Issuer|Key|Provider|Algorithm|Extended|Private|Container|ErrorCode|====' } | Select-Object -First 1)
  if ($subject -match ':\s*(.+)') { $subject = $Matches[1].Trim() } else { $subject = "" }
  $hasKey = $block -match ':\s*Yes\b|:\s*\x415\x441\x442\x44c'
  Write-Host "Thumbprint: $thumb"
  if ($subject) { Write-Host "  $subject" }
  Write-Host "  private key: $(if ($hasKey) { 'yes' } else { 'unknown' })"
  Write-Host ""
}

Write-Host "org cert  -> Settings -> N3 / EGISZ"
Write-Host "doctor    -> Staff -> doctor -> EGISZ / N3"
