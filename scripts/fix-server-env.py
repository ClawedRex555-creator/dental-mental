#!/usr/bin/env python3
"""Fix BOM/CRLF in /opt/emkaro/.env and dedupe EGISZ_SIGNING_SECRET."""
from pathlib import Path

p = Path("/opt/emkaro/.env")
raw = p.read_bytes()
text = raw.decode("utf-8-sig").replace("\r\n", "\n").replace("\r", "\n")
secret = None
out: list[str] = []
for line in text.split("\n"):
    stripped = line.lstrip("\ufeff").strip()
    if not stripped:
        if out and out[-1] == "":
            continue
        out.append("")
        continue
    if stripped.startswith("EGISZ_SIGNING_SECRET="):
        secret = stripped.split("=", 1)[1]
        continue
    out.append(line.rstrip())
while out and out[-1] == "":
    out.pop()
if secret is None:
    raise SystemExit("EGISZ_SIGNING_SECRET not found")
out.append(f"EGISZ_SIGNING_SECRET={secret}")
p.write_text("\n".join(out) + "\n", encoding="utf-8")
print("ENV_FIXED")
