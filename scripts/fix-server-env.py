#!/usr/bin/env python3
"""Normalize and optionally validate server .env (BOM, CRLF, truncated domains, duplicate keys)."""
from __future__ import annotations

import re
import sys
from pathlib import Path

DEFAULT_ENV = Path("/opt/emkaro/.env")

REQUIRED_KEYS = ("AUTH_SECRET", "APP_ROOT_DOMAIN", "POSTGRES_PASSWORD", "PHI_ENCRYPTION_KEY")

DOMAIN_LIKE_KEYS = frozenset(
    {
        "APP_ROOT_DOMAIN",
        "ACME_EMAIL",
        "EGISZ_GATEWAY_URL",
        "EGISZ_SIGNING_URL",
    }
)

# Known corruption from PowerShell/encoding (`.ru` truncated to `.u`)
_EXACT_VALUE_FIXES: dict[str, str] = {
    "emkao.u": "emkaro.ru",
}


def _fix_value(key: str, value: str) -> tuple[str, list[str]]:
    fixes: list[str] = []
    out = value

    if out in _EXACT_VALUE_FIXES:
        fixed = _EXACT_VALUE_FIXES[out]
        fixes.append(f"{key}: {out!r} -> {fixed!r}")
        out = fixed

    if "EMKSevice" in out:
        fixed = out.replace("EMKSevice", "EMKService")
        fixes.append(f"{key}: EMKSevice -> EMKService")
        out = fixed

    if key in DOMAIN_LIKE_KEYS or "@" in out or out.startswith("http"):
        if out.endswith(".u") and not out.endswith(".ru"):
            fixed = out[:-1] + "ru"
            fixes.append(f"{key}: truncated .u -> .ru")
            out = fixed
        if "@mail.u" in out:
            fixed = out.replace("@mail.u", "@mail.ru")
            fixes.append(f"{key}: @mail.u -> @mail.ru")
            out = fixed

    return out, fixes


def _read_normalized_text(path: Path) -> str:
    raw = path.read_bytes()
    return raw.decode("utf-8-sig").replace("\r\n", "\n").replace("\r", "\n")


def _parse_lines(text: str) -> tuple[dict[str, str], list[str]]:
    """Return key->value (last wins) and non-key lines preserved as comments only."""
    values: dict[str, str] = {}
    for line in text.split("\n"):
        stripped = line.lstrip("\ufeff").strip()
        if not stripped or stripped == "n":
            continue
        if stripped.startswith("#"):
            continue
        if "=" not in stripped:
            continue
        key, _, raw_val = stripped.partition("=")
        key = key.strip()
        if not key:
            continue
        values[key] = raw_val
    return values, []


def fix_env(path: Path) -> list[str]:
    if not path.is_file():
        raise SystemExit(f"ENV missing: {path}")

    text = _read_normalized_text(path)
    values, _ = _parse_lines(text)

    all_fixes: list[str] = []
    for key in list(values.keys()):
        fixed, fixes = _fix_value(key, values[key])
        values[key] = fixed
        all_fixes.extend(fixes)

    # Preserve stable order; EGISZ_SIGNING_SECRET last when present
    ordered_keys = [k for k in values if k != "EGISZ_SIGNING_SECRET"]
    if "EGISZ_SIGNING_SECRET" in values:
        ordered_keys.append("EGISZ_SIGNING_SECRET")
    out_lines = [f"{k}={values[k]}" for k in ordered_keys]

    new_text = "\n".join(out_lines) + "\n"
    old_text = text if text.endswith("\n") else text + "\n"
    if new_text != old_text or any(all_fixes):
        path.write_text(new_text, encoding="utf-8", newline="\n")
        if all_fixes:
            print("ENV_FIXES:", "; ".join(all_fixes))
        else:
            print("ENV_NORMALIZED")
    else:
        print("ENV_OK")

    return all_fixes


def validate_env(path: Path) -> list[str]:
    if not path.is_file():
        return [f"missing file: {path}"]

    values, _ = _parse_lines(_read_normalized_text(path))
    errors: list[str] = []

    for key in REQUIRED_KEYS:
        if not values.get(key, "").strip():
            errors.append(f"missing required key: {key}")

    domain = values.get("APP_ROOT_DOMAIN", "").strip()
    if domain:
        if domain.endswith(".u"):
            errors.append(f"APP_ROOT_DOMAIN corrupted (ends with .u): {domain}")
        elif domain != "localhost" and not re.fullmatch(
            r"[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+", domain
        ):
            errors.append(f"invalid APP_ROOT_DOMAIN: {domain}")
        elif domain != "localhost" and not domain.endswith(".ru"):
            if not __import__("os").environ.get("DEPLOY_SKIP_DOMAIN_CHECK"):
                errors.append(
                    f"APP_ROOT_DOMAIN must end with .ru (got {domain}); "
                    "set DEPLOY_SKIP_DOMAIN_CHECK=1 to override"
                )

    email = values.get("ACME_EMAIL", "").strip()
    if email:
        if email.endswith(".u"):
            errors.append(f"ACME_EMAIL corrupted (ends with .u): {email}")
        elif "@" not in email:
            errors.append(f"ACME_EMAIL invalid: {email}")

    for url_key in ("EGISZ_GATEWAY_URL", "EGISZ_SIGNING_URL"):
        url = values.get(url_key, "").strip()
        if url and url.endswith(".u"):
            errors.append(f"{url_key} corrupted (ends with .u): {url}")

    return errors


def main() -> None:
    args = sys.argv[1:]
    check_only = False
    if args and args[0] == "--check":
        check_only = True
        args = args[1:]

    path = Path(args[0]) if args else DEFAULT_ENV

    if check_only:
        errors = validate_env(path)
        if errors:
            print("ENV_VALIDATION_FAILED:")
            for err in errors:
                print(f"  - {err}")
            raise SystemExit(1)
        print("ENV_VALID")
        return

    fix_env(path)
    errors = validate_env(path)
    if errors:
        print("ENV_VALIDATION_FAILED:")
        for err in errors:
            print(f"  - {err}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
