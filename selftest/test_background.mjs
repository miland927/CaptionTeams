/* 在 node 里用 mock 的 chrome API 跑 background.js 的翻译后端 —— 真连 DeepSeek 验证。
 * 复用用户已有的 key(%APPDATA%\TeamsCaptionTranslator\config.json),与旧 smoke_test 同源。
 * 跑:  node extension/_selftest/test_background.mjs
 */
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";

const cfgPath = path.join(process.env.APPDATA, "TeamsCaptionTranslator", "config.json");
const apiKey = JSON.parse(fs.readFileSync(cfgPath, "utf8")).deepseek_api_key;
if (!apiKey) { console.error("config.json 里没有 deepseek_api_key"); process.exit(1); }

let listener;
const store = { apiKey, targetLang: "zh-CN" };
const chrome = {
  storage: { local: {
    get: (keys, cb) => {
      const out = {}; const arr = Array.isArray(keys) ? keys : [keys];
      for (const k of arr) if (k in store) out[k] = store[k];
      if (cb) cb(out);
      return Promise.resolve(out);
    },
    set: (obj, cb) => { Object.assign(store, obj); if (cb) cb(); return Promise.resolve(); },
  } },
  runtime: { onMessage: { addListener: (fn) => { listener = fn; } }, lastError: null },
};

const code = fs.readFileSync(new URL("../background.js", import.meta.url), "utf8");
const ctx = vm.createContext({ chrome, fetch, console, URL, setTimeout, clearTimeout });
vm.runInContext(code, ctx);

const call = (text) => new Promise((res) => listener({ type: "translate", text }, {}, res));

const hasKanji = (s) => /[一-鿿]/.test(s);
const hasKana = (s) => /[぀-ヿ]/.test(s);

const samples = [
  "では、会議を始めます。よろしくお願いします。",
  "この商品はベトナムで製造して、会員さんに紹介しています。",
];

let pass = true;
for (const s of samples) {
  const r = await call(s);
  const t = r.translated || "";
  const ok = t && hasKanji(t) && !hasKana(t); // 真中文:有汉字、无假名(还有假名=没翻)
  if (!ok) pass = false;
  console.log(`原: ${s}\n译: ${t}${r.error ? "  ✗ " + r.error : ""}  ${ok ? "✅" : "❌"}\n`);
}
// 缓存命中
const c = await call(samples[0]);
console.log(`重复一句 → cached=${c.cached === true ? "✅命中" : "❌未命中"}`);

console.log("\n=== " + (pass ? "✅ PASS —— SW 翻译后端真翻日→中通过" : "❌ FAIL") + " ===");
process.exit(pass ? 0 : 1);
