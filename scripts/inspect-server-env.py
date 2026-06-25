#!/usr/bin/env python3
from pathlib import Path

p = Path("/opt/emkaro/.env")
text = p.read_text(encoding="utf-8-sig")
lines = text.replace("\r", "").split("\n")
keys = []
for line in lines:
    if "=" in line and not line.strip().startswith("#"):
        keys.append(line.split("=", 1)[0])
print("keys:", keys)
for name in ("POSTGRES_PASSWORD", "AUTH_SECRET", "EGISZ_SIGNING_SECRET"):
    matches = [l for l in lines if l.startswith(name + "=")]
    if matches:
        val = matches[-1].split("=", 1)[1]
        print(f"{name}_len:", len(val))
    else:
        print(f"{name}: MISSING")
