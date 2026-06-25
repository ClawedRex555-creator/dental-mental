#!/usr/bin/env python3
from pathlib import Path

p = Path("/opt/emkaro/.env")
lines: list[str] = []
for line in p.read_text(encoding="utf-8-sig").replace("\r", "").split("\n"):
    s = line.strip()
    if not s or s == "n":
        continue
    if "=" not in s:
        continue
    key = s.split("=", 1)[0].strip()
    if not key or key.startswith("#"):
        continue
    lines.append(f"{key}={s.split('=', 1)[1]}")
p.write_text("\n".join(lines) + "\n", encoding="utf-8")
print("ENV_CLEANED", len(lines))
