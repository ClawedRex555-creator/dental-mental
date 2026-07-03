#!/usr/bin/env python3
"""Импорт справочника 1.2.643.2.69.1.1.1.195 из xlsx в data/nsi/."""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

try:
    import openpyxl
except ImportError as exc:
    raise SystemExit("pip install openpyxl") from exc

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/nsi/1.2.643.2.69.1.1.1.195.json"


def main() -> None:
    src = Path(sys.argv[1] if len(sys.argv) > 1 else "")
    if not src.is_file():
        raise SystemExit(f"Укажите путь к xlsx: {src or '<file>'}")

    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
    ws = wb.active
    headers: list[str] | None = None
    items: list[dict] = []

    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            headers = [
                (str(h).strip().replace("\xa0", " ") if h else f"col{j}")
                for j, h in enumerate(row)
            ]
            continue
        if not row or not row[0]:
            continue
        raw = {
            headers[j]: (
                v
                if v is None
                else (str(v).strip() if not isinstance(v, str) else v.strip())
            )
            for j, v in enumerate(row)
            if headers and j < len(headers)
        }
        item = {
            "code": raw.get("Код"),
            "idMedDocumentType": raw.get("IdMedDocumentType"),
            "name": raw.get("Наименование"),
            "nameRemd": raw.get("Наименование для выгрузки в РЭМД"),
            "dataSourceRemd": raw.get("Источник данных для регистрации  в РЭМД"),
            "remd_code": raw.get("remd_code"),
            "semd_code": raw.get("semd_code"),
            "vimis_code": raw.get("vimis_code"),
            "mime_type_remd": raw.get("mime_type_remd"),
            "fhirCode": raw.get("FhirCode"),
            "iemkObject": raw.get("Объект в ИЭМК"),
            "allowRemdExport": raw.get("Разрешена выгрузка в РЭМД"),
            "allowVimisExport": raw.get("Разрешена выгрузка в ВИМИС"),
            "doctorPortal": raw.get("Признак отображения на Портале Врача"),
        }
        items.append({k: v for k, v in item.items() if v not in (None, "", "None")})

    version = src.stem.split("_")[-1] if "_" in src.stem else None
    payload = {
        "oid": "1.2.643.2.69.1.1.1.195",
        "title": "Виды электронных медицинских документов",
        "source": f"NSI export {src.name}",
        "updatedAt": date.today().isoformat(),
        "version": version,
        "itemCount": len(items),
        "items": items,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✓ {len(items)} записей → {OUT}")


if __name__ == "__main__":
    main()
