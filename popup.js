/* 设置页 —— API Key、目标语言、默认偏好、缓存管理。全部存 chrome.storage.local。
 * content.js 进会时读这些默认值套用;background.js 翻译时读 apiKey/targetLang。 */
const LANGS = [
  ["zh-CN", "简体中文"], ["zh-TW", "繁体中文"], ["en", "英语"], ["ko", "韩语"],
  ["ru", "俄语"], ["vi", "越南语"], ["th", "泰语"], ["id", "印尼语"],
  ["es", "西班牙语"], ["fr", "法语"], ["de", "德语"], ["pt", "葡萄牙语"],
];
const $ = (id) => document.getElementById(id);

const sel = $("targetLang");
for (const [v, l] of LANGS) {
  const o = document.createElement("option");
  o.value = v; o.textContent = l;
  sel.appendChild(o);
}

// ── 载入已存设置 ──
chrome.storage.local.get(["apiKey", "targetLang", "theme", "fontSize", "showOrig", "opacity"], (c) => {
  if (c.apiKey) $("apiKey").value = c.apiKey;
  sel.value = c.targetLang || "zh-CN";
  $("theme").value = c.theme || "dark";
  $("fontSize").value = String(c.fontSize || 14);
  $("showOrig").checked = c.showOrig !== false; // 默认显示原文
  $("opacity").value = typeof c.opacity === "number" ? c.opacity : 1;
});

// ── 缓存统计 ──
function refreshCache() {
  chrome.storage.local.get(null, (all) => {
    let n = 0;
    for (const k of Object.keys(all)) if (k.startsWith("cache_")) n += Object.keys(all[k] || {}).length;
    const ci = $("cacheInfo");
    ci.style.color = ""; ci.textContent = "已缓存 " + n + " 条译文";
  });
}
refreshCache();

// ── 保存 ──
$("save").addEventListener("click", () => {
  const data = {
    apiKey: $("apiKey").value.trim(),
    targetLang: sel.value,
    theme: $("theme").value,
    fontSize: parseInt($("fontSize").value, 10),
    showOrig: $("showOrig").checked,
    opacity: parseFloat($("opacity").value),
  };
  chrome.storage.local.set(data, () => {
    const s = $("status");
    if (data.apiKey) { s.textContent = "✅ 已保存,下次进会 / 刷新生效"; s.style.color = "#6f6"; }
    else { s.textContent = "⚠ 还没填 API Key"; s.style.color = "#fc6"; }
    setTimeout(() => { s.textContent = ""; }, 2600);
  });
});

// ── 测试 Key(用当前输入框的值,不必先保存)──
$("testBtn").addEventListener("click", () => {
  const key = $("apiKey").value.trim();
  const r = $("testResult");
  if (!key) { r.textContent = "⚠ 先填 Key 再测"; r.style.color = "#fc6"; return; }
  r.textContent = "测试中…"; r.style.color = "#9cf";
  chrome.runtime.sendMessage({ type: "testKey", apiKey: key }, (resp) => {
    if (chrome.runtime.lastError || !resp) { r.textContent = "✗ 后台无响应(重新加载扩展再试)"; r.style.color = "#f88"; return; }
    if (resp.ok) { r.textContent = "✅ 可用 — おはよう→「" + (resp.sample || "") + "」"; r.style.color = "#6f6"; }
    else { r.textContent = "✗ " + (resp.error || "失败"); r.style.color = "#f88"; }
  });
});

// ── 清空缓存 ──
$("clearBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "clearCache" }, (resp) => {
    const ci = $("cacheInfo");
    if (resp && resp.ok) {
      ci.textContent = "✅ 已清空(删了 " + resp.removed + " 个语言缓存)"; ci.style.color = "#6f6";
      setTimeout(refreshCache, 1400);
    } else { ci.textContent = "✗ 清空失败"; ci.style.color = "#f88"; }
  });
});
