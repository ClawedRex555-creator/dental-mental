#!/usr/bin/env python3
"""Sync postgres role password to POSTGRES_PASSWORD from .env (no stdout secrets)."""
import subprocess
from pathlib import Path

text = Path("/opt/emkaro/.env").read_text(encoding="utf-8-sig")
password = None
for line in text.replace("\r", "").split("\n"):
    if line.startswith("POSTGRES_PASSWORD="):
        password = line.split("=", 1)[1]
if not password:
    raise SystemExit("POSTGRES_PASSWORD missing")

sql = f"ALTER USER mis WITH PASSWORD '{password.replace(chr(39), chr(39)+chr(39))}';"
subprocess.run(
    [
        "docker",
        "compose",
        "-f",
        "/opt/emkaro/docker-compose.yml",
        "exec",
        "-T",
        "postgres",
        "psql",
        "-U",
        "mis",
        "-d",
        "dentalcloud",
        "-c",
        sql,
    ],
    check=True,
    cwd="/opt/emkaro",
)
print("PG_PASSWORD_SYNCED")
