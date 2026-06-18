"""扩展版端到端自测 —— 把真扩展加载进真 Chrome,对仿真 Teams 字幕页跑全链路。

验证:content.js 采集 → chrome.runtime.sendMessage → background.js(SW)→ DeepSeek → 浮层。
即整条"扩展"链路,含 MV3 消息传递 + SW 翻译(真翻日→中)。

做法:把 extension/ 拷到临时目录、给 manifest 的 matches 临时加上 localhost(只测试用),
用 Playwright 持久化上下文 --load-extension 加载,SW 里灌入 API Key,导航到仿真页,断言中文。

跑:  py -3 extension\\_selftest\\run_extension_selftest.py
复用仿真页:web-capture/_selftest/teams_sim.html
"""
from __future__ import annotations

import http.server
import json
import os
import pathlib
import shutil
import socketserver
import sys
import tempfile
import threading

HERE = pathlib.Path(__file__).resolve().parent
EXT_DIR = HERE.parent
SIM_DIR = EXT_DIR.parent / "web-capture" / "_selftest"
SIM_PORT = 8000
SIM_PAGE = sys.argv[1] if len(sys.argv) > 1 else "teams_sim.html"
CFG = pathlib.Path(os.environ["APPDATA"]) / "TeamsCaptionTranslator" / "config.json"


def make_test_extension() -> str:
    """拷一份扩展到临时目录,manifest 加上 localhost match(仅自测用,不污染真扩展)。"""
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="teamscap_ext_"))
    for f in ("manifest.json", "background.js", "content.js", "popup.html", "popup.js"):
        shutil.copy(EXT_DIR / f, tmp / f)
    if (EXT_DIR / "icons").exists():
        shutil.copytree(EXT_DIR / "icons", tmp / "icons")
    man = json.loads((tmp / "manifest.json").read_text(encoding="utf-8"))
    man["content_scripts"][0]["matches"] += ["http://localhost:8000/*", "http://127.0.0.1:8000/*"]
    man["host_permissions"] = man.get("host_permissions", []) + ["http://localhost:8000/*", "http://127.0.0.1:8000/*"]
    (tmp / "manifest.json").write_text(json.dumps(man, ensure_ascii=False, indent=2), encoding="utf-8")
    return str(tmp)


def main() -> int:
    try:
        from playwright.sync_api import sync_playwright
    except Exception:
        print("缺 playwright:py -3 -m pip install playwright && py -3 -m playwright install chromium")
        return 2

    api_key = json.loads(CFG.read_text(encoding="utf-8")).get("deepseek_api_key", "")
    if not api_key:
        print("config.json 里没有 deepseek_api_key"); return 2

    ext = make_test_extension()
    os.chdir(SIM_DIR)
    httpd = socketserver.TCPServer(("127.0.0.1", SIM_PORT), http.server.SimpleHTTPRequestHandler)
    httpd.RequestHandlerClass.log_message = lambda *a, **k: None
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    udd = tempfile.mkdtemp(prefix="teamscap_udd_")
    logs: list[str] = []
    rows = []
    try:
        with sync_playwright() as p:
            ctx = p.chromium.launch_persistent_context(
                udd, headless=False,
                args=["--headless=new", f"--disable-extensions-except={ext}", f"--load-extension={ext}"],
            )
            # 等 SW 起来,拿到扩展并灌入 key
            sw = None
            for w in ctx.service_workers:
                sw = w
            if sw is None:
                sw = ctx.wait_for_event("serviceworker", timeout=15000)
            sw.evaluate(
                "async ({k, t}) => { await chrome.storage.local.set({apiKey: k, targetLang: t}); }",
                {"k": api_key, "t": "zh-CN"},
            )

            page = ctx.new_page()
            page.on("console", lambda m: logs.append(m.text))
            page.goto(f"http://127.0.0.1:{SIM_PORT}/{SIM_PAGE}")
            page.wait_for_timeout(30000)  # 5 条字幕流完 + SW 翻译回来
            rows = page.evaluate(
                "() => [...document.querySelectorAll('.tr')].map(tr => ({"
                " original: tr.parentElement?.querySelector('.ori')?.innerText.trim() || '',"
                " translated: tr.innerText.trim() }))"
            )
            page.screenshot(path=str(HERE / "ext_selftest_result.png"), full_page=True)
            ctx.close()
    finally:
        httpd.shutdown()
        shutil.rmtree(ext, ignore_errors=True)
        shutil.rmtree(udd, ignore_errors=True)

    print("\n=== 浮层抓到的行 ===")
    for r in rows:
        print(f"  原: {r['original']}\n  译: {r['translated']}\n")

    has_kanji = lambda s: any("一" <= c <= "鿿" for c in s)
    has_kana = lambda s: any("぀" <= c <= "ヿ" for c in s)
    translated = [r for r in rows if r["translated"] and r["translated"] != "…"
                  and has_kanji(r["translated"]) and not has_kana(r["translated"])]
    ok = len(rows) >= 4 and len(translated) >= 4

    print("=== 结论 ===")
    print(f"  抓到 {len(rows)} 行,其中 {len(translated)} 行成功翻成中文")
    print(f"  {'✅ PASS —— 扩展整条链路通(content→SW→DeepSeek→浮层)' if ok else '❌ FAIL'}")
    if not ok:
        print("\n--- 页面 console(末 25 行)---")
        for line in logs[-25:]:
            print("  ", line)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
