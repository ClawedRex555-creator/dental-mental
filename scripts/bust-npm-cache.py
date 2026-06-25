#!/usr/bin/env python3
import json
from pathlib import Path

p = Path("/opt/emkaro/package.json")
data = json.loads(p.read_text(encoding="utf-8"))
data["version"] = "0.1.1-bust"
p.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
print("PACKAGE_BUSTED")
