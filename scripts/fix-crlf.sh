#!/bin/bash
set -euo pipefail
for f in "$@"; do
  sed -i 's/\r$//' "$f"
done
echo "CRLF_FIXED: $*"
