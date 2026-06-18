/* Service Worker —— 翻译后端。
 *
 * 为什么放在 SW:Service Worker 的 fetch **不受页面 CSP 约束**,而 Teams 页面的
 * CSP(connect-src)会掐死 content script 直连任何外部地址。这是我们从 Tampermonkey +
 * 本地桥(bridge.py)迁移过来的根本原因 —— SW 原生就能干桥干的活,且无需本地服务。
 *
 * 逻辑搬自 src/teams_caption_translator/translator.py 的 DeepSeekTranslator:
 *   · build_system_prompt(干净 DOM 文本,不需要 OCR 纠错那条)
 *   · 两级缓存 L1 内存 LRU(256) + L2 chrome.storage.local(每语言 2000 条上限)
 *   · POST api.deepseek.com/chat/completions, model=deepseek-chat, temp=0.2
 * API Key 从 chrome.storage.local 读(popup 里填),永不写进页面/网络日志。
 */
const API_URL = "https://api.deepseek.com/chat/completions";

const LANG_NAMES = {
  "zh-CN": "简体中文", "zh-TW": "繁体中文", "en": "英语", "ko": "韩语",
  "ru": "俄语", "vi": "越南语", "th": "泰语", "id": "印尼语",
  "es": "西班牙语", "fr": "法语", "de": "德语", "pt": "葡萄牙语",
};
const langName = (c) => LANG_NAMES[c] || c;

// 干净 DOM 文本 → 不需要 OCR 纠错那条;保留"忽略句首说话人名"的兜底。
function buildSystemPrompt(target, context) {
  const tgt = langName(target);
  let p =
    `你是专业的实时会议字幕翻译员，负责将日语翻译成${tgt}。\n` +
    `要求：① 只输出${tgt}译文，不要输出原文、注音、解释或括注；` +
    `② 保持会议口语的自然、简洁、通顺；` +
    `③ 遇到无法理解的乱码片段直接跳过，不要音译或编造；` +
    `④ 文本开头可能混入说话人姓名，它不是讲话内容，翻译时请忽略。`;
  if (context && context.length) {
    p += `\n\n前文（仅供理解上下文，不要翻译也不要输出）：\n` + context.slice(-3).join("\n");
  }
  return p;
}

// ── L1:内存 LRU(SW 存活期间有效) ──
const L1 = new Map();
const L1_MAX = 256;
const l1Get = (k) => { if (L1.has(k)) { const v = L1.get(k); L1.delete(k); L1.set(k, v); return v; } return null; };
const l1Set = (k, v) => {
  if (L1.has(k)) L1.delete(k);
  else if (L1.size >= L1_MAX) L1.delete(L1.keys().next().value);
  L1.set(k, v);
};

// 近期原文,喂给提示词当上下文(SW 重启会清,可接受)。
const recentContext = [];

async function callDeepSeek(apiKey, text, target, context) {
  const payload = {
    model: "deepseek-chat",
    messages: [
      { role: "system", content: buildSystemPrompt(target, context) },
      { role: "user", content: text },
    ],
    max_tokens: 512,
    temperature: 0.2,
  };
  const r = await fetch(API_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const b = await r.text().catch(() => "");
    throw new Error(`DeepSeek ${r.status}: ${b.slice(0, 150)}`);
  }
  const d = await r.json();
  return (d.choices?.[0]?.message?.content || "").trim();
}

async function handleTranslate(text) {
  text = (text || "").trim();
  if (!text) return { translated: "" };

  const cfg = await chrome.storage.local.get(["apiKey", "targetLang"]);
  const apiKey = (cfg.apiKey || "").trim();
  const target = cfg.targetLang || "zh-CN";
  if (!apiKey) return { error: "未配置 API Key（点扩展图标填入）" };

  const l1Key = target + "\x00" + text;
  const hit1 = l1Get(l1Key);
  if (hit1 != null) return { translated: hit1, cached: true };

  // ── L2:storage 持久缓存 ──
  const storeKey = "cache_" + target;
  try {
    const store = await chrome.storage.local.get(storeKey);
    const c2 = store[storeKey];
    if (c2 && c2[text]) { l1Set(l1Key, c2[text]); return { translated: c2[text], cached: true }; }
  } catch (e) { /* 缓存读失败不影响翻译 */ }

  let translated = await callDeepSeek(apiKey, text, target, recentContext);
  if (!translated) translated = text;

  l1Set(l1Key, translated);
  recentContext.push(text);
  if (recentContext.length > 60) recentContext.splice(0, 30);

  // 持久化 L2(best-effort,每语言上限 2000 条 LRU)
  try {
    const store = await chrome.storage.local.get(storeKey);
    const c2 = store[storeKey] || {};
    c2[text] = translated;
    const keys = Object.keys(c2);
    if (keys.length > 2000) for (const k of keys.slice(0, keys.length - 2000)) delete c2[k];
    chrome.storage.local.set({ [storeKey]: c2 });
  } catch (e) { /* 写失败忽略 */ }

  return { translated };
}

// 测试 Key:用传入的 key(可能尚未保存)发一句最短翻译,验证 key/网络是否通。
async function testKey(apiKey) {
  apiKey = (apiKey || "").trim();
  if (!apiKey) return { ok: false, error: "未填 API Key" };
  const sample = await callDeepSeek(apiKey, "おはようございます。", "zh-CN", []);
  return { ok: true, sample };
}

// 清空缓存:清 L1 内存 + 删 storage 里所有 cache_* 持久缓存。
async function clearCache() {
  L1.clear();
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith("cache_"));
  if (keys.length) await chrome.storage.local.remove(keys);
  return { ok: true, removed: keys.length };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "translate") {
    handleTranslate(msg.text).then(sendResponse).catch((e) => sendResponse({ error: String(e?.message || e) }));
    return true; // 异步响应
  }
  if (msg?.type === "testKey") {
    testKey(msg.apiKey).then(sendResponse).catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }
  if (msg?.type === "clearCache") {
    clearCache().then(sendResponse).catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }
});
