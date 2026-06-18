"""打包 Chrome / Edge 商店上传用的 zip:只含运行时文件,排除自测与文档。
跑:  py -3 extension/selftest/package.py
产物:extension/dist/teams-caption-translator-v<version>.zip
"""
from __future__ import annotations
import json
import pathlib
import zipfile

EXT = pathlib.Path(__file__).resolve().parent.parent
ver = json.loads((EXT / "manifest.json").read_text(encoding="utf-8"))["version"]
DIST = EXT / "dist"
DIST.mkdir(exist_ok=True)
out = DIST / f"teams-caption-translator-v{ver}.zip"

RUNTIME = ["manifest.json", "background.js", "content.js", "popup.html", "popup.js"]

with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for f in RUNTIME:
        z.write(EXT / f, f)
    for p in sorted((EXT / "icons").glob("*.png")):
        z.write(p, f"icons/{p.name}")

print(f"packaged -> {out}  ({out.stat().st_size} bytes)")
print("  内含:", ", ".join(RUNTIME), "+ icons/*.png")
