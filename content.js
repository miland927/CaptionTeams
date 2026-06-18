/* Content Script —— 采集 Teams 网页实时字幕 + 右下角双语浮层。
 *
 * 搬自 web-capture/teams-caption-translator.user.js(Tampermonkey 版),两处改动:
 *   1) 翻译请求 GM_xmlhttpRequest → chrome.runtime.sendMessage(走 SW,绕页面 CSP)。
 *   2) 目标语言 写 chrome.storage.local(popup 与 SW 共享)。
 * 并强化 harvest:3 层回退 + 6 秒自诊断 —— 真实 DOM 选择器若不命中,自动在 F12 打印结构。
 */
(function () {
  "use strict";
  if (window.__teamsCapRunning) return;
  window.__teamsCapRunning = true;

  const FINALIZE_MS = 1200;
  const caps = (window.__teamsCaps = []);
  const pending = new Map(), finalized = new Map();
  let rootEl, box, logEl, scrollEl, observer, warnedNet = false;
  let targetLang = "zh-CN";

  // 选择器对齐开源 Live-Captions-Saver(Teams 网页 = Fluent UI v9)
  const SEL = {
    item: [".fui-ChatMessageCompact", ".fui-ChatMessageContent__root",
           '[data-tid="closed-caption-message"]', ".ui-chat__item"],
    author: ['[data-tid="author"]', '[class*="authorName"]', '[class*="author"]', '[class*="displayName"]'],
    text: ['[data-tid="closed-caption-text"]', '[class*="captionText"]', ".ui-chat__message__content"],
  };
  const txt = (n) => (n?.innerText || n?.textContent || "").replace(/\s+/g, " ").trim();
  const pick = (el, sels) => { for (const s of sels) { const n = el.querySelector?.(s); if (n) return n; } return null; };
  const findRoot = () => {
    for (const s of ["[data-tid='closed-caption-v2-window-wrapper']", "[data-tid='closed-captions-renderer']",
                     "[data-tid='closed-caption-renderer-wrapper']", "[data-tid*='closed-caption']",
                     "[class*='closedCaption']"]) { const n = document.querySelector(s); if (n) return n; }
    return null;
  };

  function stop() {
    observer?.disconnect();
    pending.forEach((p) => clearTimeout(p.timer));
    box?.remove(); box = null;
    window.__teamsCapRunning = false;
  }

  // 拖拽:抓标题栏(避开右侧控件)把面板移到任意位置;一拖就从 right/bottom 切到 left/top 定位
  function enableDrag(handle) {
    let dragging = false, offX = 0, offY = 0;
    handle.addEventListener("mousedown", (e) => {
      if (e.target.closest("[data-ctrl]")) return; // 点的是控件,不拖
      const r = box.getBoundingClientRect();
      box.style.left = r.left + "px"; box.style.top = r.top + "px";
      box.style.right = "auto"; box.style.bottom = "auto";
      offX = e.clientX - r.left; offY = e.clientY - r.top;
      dragging = true; e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const x = Math.max(0, Math.min(window.innerWidth - box.offsetWidth, e.clientX - offX));
      const y = Math.max(0, Math.min(window.innerHeight - 30, e.clientY - offY));
      box.style.left = x + "px"; box.style.top = y + "px";
    });
    document.addEventListener("mouseup", () => { dragging = false; });
  }

  // ✕ 关闭 = 隐藏面板,顶部留一个小胶囊,点它复原(采集不停,字幕不丢)
  function showLauncher() {
    if (document.getElementById("__teamsCapLauncher")) return;
    const l = document.createElement("div");
    l.id = "__teamsCapLauncher";
    l.textContent = "🈂 双语字幕";
    l.title = "点击恢复字幕面板";
    l.style.cssText = "position:fixed;top:10px;right:16px;z-index:2147483647;background:rgba(20,22,28,.92);color:#eee;" +
      "font:12px/1 'Segoe UI',sans-serif;padding:7px 11px;border-radius:14px;cursor:pointer;box-shadow:0 3px 12px rgba(0,0,0,.4);user-select:none";
    l.onclick = () => { if (box) box.style.display = ""; l.remove(); };
    document.body.appendChild(l);
  }

  // ──────────── 浮层 UI(原样搬自 userscript) ────────────
  let currentFontSize = 14;
  let currentOpacity = 1;
  let showOriginal = true;
  let isDark = true;
  const ensureBox = () => {
    if (box) return;
    box = document.createElement("div");
    box.style.cssText = "position:fixed;width:460px;max-height:88vh;min-width:260px;min-height:80px;display:flex;flex-direction:column;overflow:hidden;resize:both;" +
      "z-index:2147483647;background:rgba(20,22,28,.93);color:#eee;font:14px/1.55 \"Segoe UI\",sans-serif;" +
      "padding:0;border-radius:10px;box-shadow:0 6px 26px rgba(0,0,0,.45)";
    // 初始用 left/top 定位(右上区域)——这样右下角的缩放手柄能自由拖(right/bottom 锚定会卡住缩放)
    box.style.left = Math.max(8, window.innerWidth - 476) + "px";
    box.style.top = Math.round(window.innerHeight * 0.18) + "px";
    box.style.fontSize = currentFontSize + "px";   // 套用弹窗里的默认字号
    box.style.opacity = String(currentOpacity);     // 套用弹窗里的默认透明度
    const applyTheme = () => {
      box.style.background = isDark ? "rgba(20,22,28,.93)" : "rgba(245,246,248,.96)";
      box.style.color = isDark ? "#eee" : "#1b1b1f";
      box.style.setProperty("--spk", isDark ? "#6cf" : "#0a5fd0");
      box.style.setProperty("--bd", isDark ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.12)");
    };
    const head = document.createElement("div");
    head.style.cssText = "font-size:12px;opacity:.7;flex-shrink:0;padding:8px 12px;cursor:move;display:flex;justify-content:space-between;align-items:center;gap:8px;border-bottom:1px solid rgba(255,255,255,.08);user-select:none";
    const titleSpan = document.createElement("span");
    titleSpan.textContent = "⠿ 双语字幕";
    titleSpan.title = "按住此处拖动面板;右下角可缩放";
    titleSpan.style.cssText = "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:1";
    head.appendChild(titleSpan);
    const controls = document.createElement("span");
    controls.dataset.ctrl = "1"; // 标记:拖拽时点这里不触发移动
    controls.style.cssText = "display:flex;flex-wrap:nowrap;flex-shrink:0;align-items:center;gap:3px";
    const btnMinus = document.createElement("span");
    btnMinus.textContent = "A−"; btnMinus.title = "缩小字体";
    btnMinus.style.cssText = "cursor:pointer;opacity:.7;padding:0 4px;font-size:13px;font-weight:bold";
    btnMinus.onclick = () => { currentFontSize = Math.max(10, currentFontSize - 2); box.style.fontSize = currentFontSize + "px"; };
    const btnPlus = document.createElement("span");
    btnPlus.textContent = "A+"; btnPlus.title = "放大字体";
    btnPlus.style.cssText = "cursor:pointer;opacity:.7;padding:0 4px;font-size:13px;font-weight:bold";
    btnPlus.onclick = () => { currentFontSize = Math.min(28, currentFontSize + 2); box.style.fontSize = currentFontSize + "px"; };
    controls.appendChild(btnMinus); controls.appendChild(btnPlus);
    const opacitySlider = document.createElement("input");
    opacitySlider.type = "range"; opacitySlider.min = "0.15"; opacitySlider.max = "1.0"; opacitySlider.step = "0.01"; opacitySlider.value = String(currentOpacity);
    opacitySlider.title = "整体透明度(背景+字幕一起)";
    opacitySlider.style.cssText = "width:56px;height:4px;cursor:pointer;opacity:.85;accent-color:#6cf;margin:0 2px";
    opacitySlider.addEventListener("input", () => { box.style.opacity = opacitySlider.value; }); // 整块面板一起透明,字幕也跟着
    controls.appendChild(opacitySlider);
    // 浅色/深色 切换
    const themeBtn = document.createElement("span");
    themeBtn.textContent = isDark ? "🌙" : "☀️"; themeBtn.title = "切换 浅色/深色";
    themeBtn.style.cssText = "cursor:pointer;opacity:.7;padding:0 4px;font-size:13px";
    themeBtn.onclick = () => { isDark = !isDark; themeBtn.textContent = isDark ? "🌙" : "☀️"; applyTheme(); chrome.storage.local.set({ theme: isDark ? "dark" : "light" }); };
    controls.appendChild(themeBtn);
    const copyAllBtn = document.createElement("span");
    copyAllBtn.textContent = "📋"; copyAllBtn.title = "复制全部译文";
    copyAllBtn.style.cssText = "cursor:pointer;opacity:.6;font-size:12px;padding:0 3px";
    copyAllBtn.onclick = () => {
      const trEls = logEl ? logEl.querySelectorAll(".tr") : [];
      const texts = [];
      trEls.forEach((el) => { const t = el.textContent.replace(/^…/, "").trim(); if (t) texts.push(t); });
      if (texts.length) navigator.clipboard.writeText(texts.join("\n")).then(() => { copyAllBtn.textContent = "✓"; setTimeout(() => { copyAllBtn.textContent = "📋"; }, 200); }).catch(() => {});
    };
    controls.appendChild(copyAllBtn);
    // 语言下拉
    const langSel = document.createElement("select");
    langSel.title = "目标语言";
    langSel.style.cssText = "background:#333;color:#eee;border:1px solid #555;font-size:10px;padding:1px 2px;cursor:pointer;opacity:.7;max-width:44px";
    const LANGS = [["zh-CN", "中"], ["ja", "日"], ["zh-TW", "繁"], ["en", "英"], ["ru", "俄"], ["vi", "越"], ["th", "泰"], ["id", "印尼"], ["es", "西"], ["fr", "法"], ["de", "德"], ["pt", "葡"], ["ko", "韩"]];
    LANGS.forEach(([code, label]) => { const o = document.createElement("option"); o.value = code; o.textContent = label; langSel.appendChild(o); });
    langSel.value = targetLang;
    langSel.addEventListener("change", () => { targetLang = langSel.value; chrome.storage.local.set({ targetLang }); });
    controls.appendChild(langSel);
    // 原文开关
    const toggleOrig = document.createElement("span");
    toggleOrig.id = "__teamsCapToggle";
    toggleOrig.textContent = "👁"; toggleOrig.title = "显示/隐藏原文";
    toggleOrig.style.cssText = "cursor:pointer;opacity:.7;padding:0 4px;font-size:13px";
    toggleOrig.style.opacity = showOriginal ? ".7" : ".3";
    toggleOrig.onclick = () => { showOriginal = !showOriginal; toggleOrig.style.opacity = showOriginal ? ".7" : ".3"; box.querySelectorAll(".ori").forEach((el) => { el.style.display = showOriginal ? "" : "none"; }); };
    controls.appendChild(toggleOrig);
    // 导出
    const exportBtn = document.createElement("span");
    exportBtn.id = "__teamsCapExport";
    exportBtn.textContent = "⬇"; exportBtn.title = "导出字幕";
    exportBtn.style.cssText = "cursor:pointer;opacity:.6;font-size:12px;padding:0 4px";
    exportBtn.onclick = () => {
      const fmt = prompt("导出格式: md / json / txt", "md");
      if (!fmt) return;
      const ts = new Date().toISOString().slice(0, 10);
      let content, mime, ext;
      if (fmt === "json") { content = JSON.stringify(caps, null, 2); mime = "application/json"; ext = "json"; }
      else if (fmt === "txt") { content = caps.map((c) => `[${c.t || ""}] ${c.speaker || "?"}: ${c.text} → ${c.translated || ""}`).join("\n"); mime = "text/plain"; ext = "txt"; }
      else { content = "| 时间 | 说话人 | 原文 | 译文 |\n|:--|:--|:--|:--|\n" + caps.map((c) => `| ${c.t || ""} | ${c.speaker || "?"} | ${c.text} | ${c.translated || ""} |`).join("\n"); mime = "text/markdown"; ext = "md"; }
      const blob = new Blob(["﻿" + content], { type: mime });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `teams-caption-${ts}.${ext}`; a.click();
    };
    controls.appendChild(exportBtn);
    // 迷你模式
    const miniBtn = document.createElement("span");
    miniBtn.id = "__teamsCapMini";
    miniBtn.textContent = "⛶"; miniBtn.title = "迷你模式";
    miniBtn.style.cssText = "cursor:pointer;opacity:.7;padding:0 4px;font-size:14px";
    let isMini = false;
    miniBtn.onclick = () => {
      isMini = !isMini;
      if (scrollEl) scrollEl.style.display = isMini ? "none" : ""; // 只折叠字幕区,保留整条控制栏(避免窄宽裁掉按钮/无法还原)
    };
    controls.appendChild(miniBtn);
    const x = document.createElement("span");
    x.textContent = "✕"; x.title = "关闭"; x.style.cssText = "cursor:pointer;opacity:.7;padding:0 4px";
    x.onclick = () => { box.style.display = "none"; showLauncher(); }; controls.appendChild(x);
    head.appendChild(controls);
    box.appendChild(head);
    scrollEl = document.createElement("div");
    scrollEl.style.cssText = "flex:1;overflow-y:auto;padding:4px 12px 10px";
    const status = document.createElement("div");
    status.id = "__capStatus";
    status.style.cssText = "font-size:13px;opacity:.85;padding:2px 0 4px";
    status.textContent = "🟢 已接管字幕，等待发言…";
    scrollEl.appendChild(status);
    logEl = document.createElement("div"); scrollEl.appendChild(logEl);
    box.appendChild(scrollEl);
    applyTheme();
    document.body.appendChild(box);
    enableDrag(head);
  };

  const setStatus = (msg) => { const st = document.getElementById("__capStatus"); if (st) st.textContent = msg; };

  const render = (speaker, original) => {
    ensureBox();
    const st = document.getElementById("__capStatus"); if (st) st.remove();
    const row = document.createElement("div");
    row.style.cssText = "margin:8px 0;padding-bottom:8px;border-bottom:1px solid var(--bd,rgba(255,255,255,.08));display:flex;justify-content:space-between;align-items:flex-start";
    const contentDiv = document.createElement("div");
    contentDiv.style.cssText = "flex:1";
    const who = speaker && speaker !== "?" ? `<span style="color:var(--spk,#6cf)">${speaker}</span> ` : "";
    contentDiv.innerHTML = `<div class="ori" style="opacity:.5;font-size:12px">${who}${original}</div>` +
      `<div class="tr" style="margin-top:2px"><span style="opacity:.4">…</span></div>`;
    if (!showOriginal) { const o = contentDiv.querySelector(".ori"); if (o) o.style.display = "none"; }
    row.appendChild(contentDiv);
    const copyBtn = document.createElement("span");
    copyBtn.textContent = "📋"; copyBtn.title = "复制译文";
    copyBtn.style.cssText = "cursor:pointer;opacity:.6;font-size:12px;padding:2px 4px;flex-shrink:0";
    copyBtn.onclick = () => {
      const trEl = row.querySelector(".tr");
      const text = trEl ? trEl.textContent.replace(/^…/, "").trim() : "";
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => { copyBtn.textContent = "✓"; setTimeout(() => { copyBtn.textContent = "📋"; }, 200); }).catch(() => {});
    };
    row.appendChild(copyBtn);
    logEl.appendChild(row);
    while (logEl.children.length > 12) logEl.removeChild(logEl.firstChild);
    scrollEl.scrollTop = scrollEl.scrollHeight;
    return row.querySelector(".tr");
  };

  const translate = (cap) => {
    const slot = render(cap.speaker, cap.text);
    chrome.runtime.sendMessage({ type: "translate", text: cap.text }, (resp) => {
      if (chrome.runtime.lastError || !resp) {
        slot.innerHTML = '<span style="opacity:.45">(翻译服务未响应 —— 重载扩展试试)</span>';
        if (!warnedNet) { warnedNet = true; console.warn("[teams-cap] SW 无响应:", chrome.runtime.lastError?.message); }
        return;
      }
      if (resp.error) {
        slot.textContent = cap.text;
        slot.innerHTML += ` <span style="color:#f88;font-size:11px">(${resp.error})</span>`;
        return;
      }
      const t = resp.translated || cap.text;
      slot.textContent = t; cap.translated = t;
      try { localStorage.setItem("__teamsCapHistory", JSON.stringify(caps)); } catch (e) {}
    });
  };

  const emit = (key, speaker, text) => {
    const prev = finalized.get(key);
    if (prev && (text.startsWith(prev) || prev.startsWith(text)) && Math.abs(text.length - prev.length) <= 4) {
      finalized.set(key, text.length >= prev.length ? text : prev); return; // 渐进重复 → 静默
    }
    finalized.set(key, text);
    const cap = { t: new Date().toTimeString().slice(0, 8), speaker: speaker || "?", text, translated: "" };
    caps.push(cap);
    try { if (caps.length > 200) caps.splice(0, caps.length - 200); localStorage.setItem("__teamsCapHistory", JSON.stringify(caps)); } catch (e) {}
    translate(cap);
  };
  const finalize = (key) => { const p = pending.get(key); if (!p) return; pending.delete(key); if (p.text) emit(key, p.speaker, p.text); };

  // ──────────── 采集:3 层回退 ────────────
  let gotSomething = false;
  // 文本节点 → 上溯到"最近的、含说话人的"消息容器(说话人与文本是兄弟,故不能停在文本节点自身)。
  const toContainer = (tn) => {
    let p = tn.parentElement;
    for (let up = 0; p && up < 4; up++, p = p.parentElement) {
      if (p.querySelector('[data-tid="author"],[class*="authorName"],[class*="author"],[class*="displayName"]')) return p;
    }
    return tn.parentElement || tn; // 没找到说话人(单人会场等)→ 退用父元素,文本仍能抓
  };
  function collectItems(root) {
    // 第 1 层:已知 item 容器选择器
    for (const s of SEL.item) { const got = root.querySelectorAll(s); if (got.length) return [...got]; }
    // 第 2 层:按文本节点反查(item 类名变了也能抓:字幕文本 → 上溯到含说话人的容器)
    for (const s of SEL.text) {
      const got = root.querySelectorAll(s);
      if (got.length) return [...got].map(toContainer).filter(Boolean);
    }
    // 第 3 层:穿透 shadow DOM 找文本节点
    const hosts = [...root.querySelectorAll("*")].filter((n) => n.shadowRoot);
    for (const h of hosts) {
      for (const s of SEL.text) {
        const got = h.shadowRoot.querySelectorAll(s);
        if (got.length) return [...got].map(toContainer).filter(Boolean);
      }
    }
    return [];
  }

  const harvest = () => {
    const root = rootEl || document;
    const items = collectItems(root);
    if (!items.length) return;
    gotSomething = true;
    items.forEach((el, i) => {
      if (el.closest && el.closest('button,[role="button"]')) return;
      const speaker = txt(pick(el, SEL.author));
      const text = txt(pick(el, SEL.text)) || txt(el);
      if (!text) return;
      const key = el.id || el.getAttribute?.("data-tid") || `${speaker}#${i}`;
      const prev = pending.get(key);
      if (prev && prev.text === text) return;
      if (prev) clearTimeout(prev.timer);
      pending.set(key, { speaker, text, timer: setTimeout(() => finalize(key), FINALIZE_MS) });
    });
  };

  // ──────────── 自诊断:找到字幕容器但 6 秒没解析到字幕条 → 打印真实结构 ────────────
  let diagTimer = 0, dumped = false;
  function armDiagnostic() {
    if (diagTimer || dumped) return;
    diagTimer = setTimeout(() => {
      if (gotSomething || dumped || !rootEl) return;
      dumped = true;
      setStatus("⚠ 抓到字幕容器但没解析到字幕条 —— 已在控制台(F12)打印诊断");
      console.warn("[teams-cap] 6 秒未解析到任何字幕条,真实结构诊断如下(把整段贴回来即可精修选择器):");
      console.log("[teams-cap] root =", rootEl.getAttribute("data-tid") || rootEl.className);
      console.log("[teams-cap] root.outerHTML(前 2500):\n" + rootEl.outerHTML.slice(0, 2500));
      const cand = [...rootEl.querySelectorAll("*")].filter((n) => {
        const t = (n.innerText || "").replace(/\s+/g, " ").trim();
        return t.length > 1 && n.children.length <= 4;
      }).slice(0, 25);
      cand.forEach((n) => console.log("  •", n.tagName, "| tid=", n.getAttribute("data-tid"),
        "| cls=", (n.className || "").toString().slice(0, 70), "| txt=", (n.innerText || "").replace(/\s+/g, " ").trim().slice(0, 45)));
    }, 6500);
  }

  // ──────────── 启动 ────────────
  let hTimer;
  const schedule = () => {
    if (!rootEl) { rootEl = findRoot(); if (rootEl) { ensureBox(); armDiagnostic(); } }
    clearTimeout(hTimer); hTimer = setTimeout(harvest, 150);
  };

  chrome.storage.local.get(["targetLang", "theme", "fontSize", "showOrig", "opacity"], (c) => {
    if (c.targetLang) targetLang = c.targetLang;
    if (c.theme) isDark = c.theme !== "light";
    if (typeof c.fontSize === "number") currentFontSize = c.fontSize;
    if (typeof c.showOrig === "boolean") showOriginal = c.showOrig;
    if (typeof c.opacity === "number") currentOpacity = c.opacity;
    rootEl = findRoot();
    if (rootEl) { ensureBox(); armDiagnostic(); }
    observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    // 恢复历史
    try {
      const saved = localStorage.getItem("__teamsCapHistory");
      if (saved) { const h = JSON.parse(saved); if (Array.isArray(h)) h.forEach((c2) => caps.push(c2)); }
    } catch (e) {}
    harvest();
  });

  // 快捷键
  document.addEventListener("keydown", (e) => {
    if (!e.ctrlKey || !e.shiftKey) return;
    switch (e.key.toLowerCase()) {
      case "c": e.preventDefault(); if (caps.length) { const last = caps[caps.length - 1]; navigator.clipboard.writeText(last.translated || last.text).catch(() => {}); } break;
      case "e": e.preventDefault(); document.querySelector("#__teamsCapExport")?.click(); break;
      case "h": e.preventDefault(); document.querySelector("#__teamsCapToggle")?.click(); break;
      case "m": e.preventDefault(); document.querySelector("#__teamsCapMini")?.click(); break;
    }
  });

  console.log("[teams-cap] content script 已加载,等待字幕…(在 Teams 里打开实时字幕即自动显示双语)");
})();
