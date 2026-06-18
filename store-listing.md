# Chrome 应用商店 上架材料(提交时复制粘贴用)

> 这份文件不打包进扩展,只是你去 [Chrome 开发者后台](https://chrome.google.com/webstore/devconsole)
> 提交时,把下面对应内容填进各栏。Edge 加盟商店(免 $5)同理。

## 基本信息

- **名称(Name):** Teams 双语字幕翻译 (DeepSeek) — Bilingual Captions
- **类别(Category):** Productivity / 效率
- **语言(Language):** 简体中文(主)、English
- **可见性(Visibility):** 建议先 **Unlisted(不公开,凭链接安装)**,稳定后再转 Public。

## 简短描述(Summary,≤132 字符)

中文:Teams 网页实时字幕一键译成中文双语显示,用你自己的 DeepSeek Key,纯本地、无后台。

EN: Real-time bilingual translation of Microsoft Teams live captions via your own DeepSeek key. Local-only, no server.

## 详细描述(Description)

把网页版 Microsoft Teams 的实时字幕,实时翻译并以「原文 + 译文」双语浮层显示在画面上。

• 纯浏览器端,无需安装任何后台程序
• 用你自己的 DeepSeek API Key(数据只发往 DeepSeek,不经过任何第三方服务器)
• 支持译成 简体/繁体中文、英、日、韩、俄、越、泰、印尼、西、法、德、葡 共 13 种语言
• 浮层可拖动、缩放、调透明度、切换深/浅色、调字号、显示/隐藏原文
• 可复制、导出(md/json/txt),翻译结果本地缓存提速
• 进入会议、打开 Teams 实时字幕即自动显示,零额外操作

使用前请在扩展弹窗填入 DeepSeek API Key(platform.deepseek.com 申请)。
本扩展不收集任何数据;字幕文本仅发往 DeepSeek 用于翻译。隐私政策见仓库 PRIVACY.md。

## 单一用途说明(Single purpose,Chrome 必填)

Translate the live captions of Microsoft Teams web meetings in real time and
display them as a bilingual overlay.

## 权限理由(Permission justifications,Chrome 必填)

- **storage** — 保存用户的 API Key、目标语言、界面偏好,以及本地翻译缓存。
- **host_permissions: https://api.deepseek.com/** — 向 DeepSeek 发送字幕文本以获取翻译。
- **content script on teams.microsoft.com / *.cloud.microsoft / teams.live.com** —
  读取会议实时字幕的 DOM 文本并在页面上绘制双语浮层。
- **未使用** tabs、远程代码、cookies、webRequest 等敏感权限。

## 数据安全表(Data safety / 需要勾选的)

- 收集并发送到第三方的数据:**会议字幕文本**(发往 DeepSeek 做翻译)。
- 本地存储(不离开设备):API Key、设置、翻译缓存。
- **不**出售数据;**不**用于广告;**不**做用户追踪/分析。
- 隐私政策 URL:填你 GitHub 仓库里 PRIVACY.md 的 raw 链接。

## 提交清单

- [x] 图标 16/32/48/128(icons/,已含)
- [ ] 截图 1280×800 或 640×400(至少 1 张;可用 selftest/promo_shot.png 生成的干净演示图)
- [ ] 隐私政策 URL(指向 PRIVACY.md)
- [ ] 打包 zip(运行 selftest/package.py 生成 dist/teams-caption-translator-vX.zip)
- [ ] $5 一次性开发者注册(Chrome);Edge 商店免费
- [ ] 提交审核(1~3 天)
