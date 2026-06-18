# Teams 双语字幕翻译 (DeepSeek)

把 **网页版 Microsoft Teams** 的实时字幕,实时翻译成中文(或其它 12 种语言),
以双语浮层显示在画面右上角。**纯浏览器端,无需任何后台服务**;翻译用你自己的
[DeepSeek](https://platform.deepseek.com/) API Key,数据只发往 DeepSeek。

> 日语字幕 → DeepSeek → 右上角「原文(淡)+ 译文(亮)」双语浮层

## 安装

### 方式一:Chrome 应用商店(最简单)

> 上架后填入链接 —— 一键安装,自动更新,无需开发者模式。

### 方式二:手动加载(开源版,立即可用)

1. 下载本仓库(绿色 **Code → Download ZIP**),解压。
2. Chrome 地址栏进 `chrome://extensions`,右上角打开**开发者模式**。
3. 点**「加载已解压的扩展程序」**,选解压出来的这个文件夹。

## 配置(一次)

点工具栏的扩展图标 → 填 **DeepSeek API Key** → 选目标语言 → **保存**。
(没有 Key?去 [platform.deepseek.com](https://platform.deepseek.com/) 申请,几块钱能用很久。)
可点「**测试**」按钮当场验证 Key 是否可用。

## 使用

进入 Teams 网页会议 → 打开**实时字幕**(··· 更多 → 语言和语音 → 打开实时字幕)→
右上角自动出现双语浮层。

**浮层控件:** `A− A+` 字号 · 透明度滑块 · `📋` 复制全部 · `🌙/☀️` 深浅色 ·
语言下拉 · `👁` 原文开关 · `⬇` 导出(md/json/txt) · `⛶` 迷你 · `✕` 隐藏。
标题栏可**拖动**,右下角可**缩放**。`✕` 隐藏后右上角留一颗胶囊可复原。
快捷键 `Ctrl+Shift+` `C`(复制最后一条)/ `E`(导出)/ `H`(原文)/ `M`(迷你)。

弹窗里还可设默认偏好(主题 / 字号 / 是否显示原文 / 透明度)、查看与清空翻译缓存。

## 隐私

API Key 只存在你本机浏览器(`chrome.storage.local`),仅用于向 DeepSeek 鉴权;
字幕文本仅发往 DeepSeek 做翻译,**不经过任何作者服务器、无统计追踪**。
详见 [PRIVACY.md](PRIVACY.md)。

## 工作原理

```
content.js   读 Teams 字幕 DOM + 画双语浮层 ──chrome.runtime.sendMessage──┐
                                                                          ▼
background.js (Service Worker)        直接 fetch api.deepseek.com(绕过页面 CSP)+ 两级缓存
                                                                          ▲
popup.html/js  填 Key / 选语言 / 默认偏好 ──chrome.storage.local──────────┘
```

采集对 Teams 字幕条用三层回退选择器(类名变了也能抓),找到容器但 6 秒没解析到字幕条
会自动在 F12 打印结构以便修选择器。

## 开发 / 自测

```bash
node --check content.js background.js popup.js     # 语法
py -3 extension/selftest/test_background.mjs        # SW 翻译后端(真连 DeepSeek)
py -3 extension/selftest/run_extension_selftest.py  # 真 Chrome 加载扩展跑全链路(默认/回退仿真页)
```

## License

[MIT](LICENSE)
