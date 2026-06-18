"""生成扩展图标 icons/icon{16,32,48,128}.png —— 用 Playwright 渲染 SVG(不依赖任何图像库)。
图案:蓝底圆角方块 + 白色对话气泡,气泡内两条字幕行(上灰=原文、下蓝=译文)= 双语字幕。
跑:  py -3 extension/selftest/make_icons.py
"""
from __future__ import annotations
import pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "icons"
OUT.mkdir(exist_ok=True)

SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="100%" height="100%">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2f8bff"/><stop offset="1" stop-color="#0a56d8"/>
    </linearGradient>
  </defs>
  <rect x="6" y="6" width="116" height="116" rx="28" fill="url(#g)"/>
  <g>
    <rect x="18" y="30" width="92" height="60" rx="15" fill="#ffffff"/>
    <path d="M40 90 L40 108 L62 90 Z" fill="#ffffff"/>
    <rect x="33" y="48" width="46" height="10" rx="5" fill="#9aa6b8"/>
    <rect x="33" y="66" width="62" height="11" rx="5.5" fill="#0a56d8"/>
  </g>
</svg>"""

HTML = ("<!doctype html><meta charset=utf-8>"
        "<style>*{margin:0;padding:0}html,body{width:100%;height:100%;background:transparent;overflow:hidden}"
        "svg{display:block}</style>" + SVG)


def main() -> None:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        try:
            b = p.chromium.launch(channel="chrome")
        except Exception:
            b = p.chromium.launch()
        for s in (16, 32, 48, 128):
            pg = b.new_page(viewport={"width": s, "height": s}, device_scale_factor=1)
            pg.set_content(HTML)
            pg.wait_for_timeout(120)
            (OUT / f"icon{s}.png").write_bytes(pg.screenshot(omit_background=True))
            pg.close()
        b.close()
    print("icons ->", OUT)


if __name__ == "__main__":
    main()
