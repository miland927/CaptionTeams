# 隐私政策 / Privacy Policy

**Teams 双语字幕翻译 (DeepSeek)** —— 最后更新 2026-06-18

## 中文

本扩展是纯本地工具,**作者不运营任何服务器,不收集、不存储、不传输你的任何数据**到作者方。

- **DeepSeek API Key**:由你在设置弹窗填写,保存在你本机浏览器的 `chrome.storage.local`。
  它**仅**被用于向 `https://api.deepseek.com` 发起翻译请求时鉴权,绝不发往其它任何地方。
- **字幕文本**:你打开的 Teams 会议的字幕文本,会被发送到 **DeepSeek**(`api.deepseek.com`)
  以获取翻译结果。这是本扩展唯一的对外数据流向。除此之外不发往任何第三方,不发往作者。
- **翻译缓存与历史**:为提速和支持导出,译文会缓存在你本机(`chrome.storage.local` 与页面
  `localStorage`)。它们只存在你的设备上,可在弹窗里一键清空。
- **无统计、无追踪、无广告、无远程日志。**

**权限说明:** `storage`(保存设置与缓存)、对 `api.deepseek.com` 的主机权限(发翻译请求)、
在 Teams 域名下注入内容脚本(读取字幕、绘制浮层)。

你发送给 DeepSeek 的数据,受 [DeepSeek 隐私政策](https://platform.deepseek.com/) 约束。

## English

This extension is a purely local tool. **The author runs no server and does not
collect, store, or transmit any of your data** to the author.

- **DeepSeek API Key** — entered by you in the popup, stored in your browser's
  `chrome.storage.local`. It is used **only** to authenticate translation
  requests to `https://api.deepseek.com`, and is never sent anywhere else.
- **Caption text** — the caption text of the Teams meeting you open is sent to
  **DeepSeek** (`api.deepseek.com`) to obtain translations. This is the only
  outbound data flow. Nothing is sent to any other third party or to the author.
- **Translation cache & history** — cached locally (`chrome.storage.local` and
  page `localStorage`) for performance and export. It stays on your device and
  can be cleared from the popup.
- **No analytics, tracking, ads, or remote logging.**

**Permissions:** `storage` (settings & cache), host access to `api.deepseek.com`
(translation requests), and a content script on Teams domains (read captions,
draw the overlay).

Data you send to DeepSeek is governed by the
[DeepSeek Privacy Policy](https://platform.deepseek.com/).

## 联系 / Contact

问题与反馈请走 GitHub Issues。
Please file issues and feedback on GitHub:
https://github.com/miland927/CaptionTeams/issues
