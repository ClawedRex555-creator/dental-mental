#!/bin/bash
# Скачивает официальный ZIP с портала ЕГИСЗ (схематрон + руководство + примеры).
# WAF портала может блокировать curl — тогда скачайте ZIP вручную из docs/EGISZ-MATERIALS.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/data/egisz/schematron"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

case "${1:-consultation-rev4}" in
  consultation-rev4|119)
    LABEL="consultation-rev4"
    URL="https://portal.egisz.rosminzdrav.ru/media/6134/download/1.2.643.5.1.13.13.15.14-1.2.643.5.1.13.13.15.14.4.zip?v=4"
    ;;
  consultation-rev5|227)
    LABEL="consultation-rev5"
    URL="https://portal.egisz.rosminzdrav.ru/materials/4557"
    echo "Для SEMD 227 откройте $URL в браузере и скачайте ZIP вручную."
    exit 0
    ;;
  *)
    echo "Usage: $0 [consultation-rev4|consultation-rev5]"
    exit 1
    ;;
esac

DEST="$OUT_DIR/$LABEL"
mkdir -p "$DEST"
ZIP="$DEST/bundle.zip"

echo ">>> $LABEL"
echo "    $URL"
if curl -fsSL --max-time 120 -A "$UA" -o "$ZIP" "$URL"; then
  echo "✓ saved $ZIP"
  if command -v unzip >/dev/null 2>&1; then
    unzip -o "$ZIP" -d "$DEST/extracted" >/dev/null
    echo "✓ extracted to $DEST/extracted"
    find "$DEST/extracted" -name '*.sch' -print 2>/dev/null || true
  fi
else
  echo "✗ download failed (WAF?). См. docs/EGISZ-MATERIALS.md — скачайте ZIP вручную."
  exit 1
fi
