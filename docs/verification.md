# 复现浏览器验收

核心游戏不需要 npm 依赖。可选浏览器验收使用 Playwright，安装的工具和浏览器不随仓库分发：

```powershell
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node scripts/verify-browser.mjs
```

脚本启动自己持有的随机回环端口并在结束时关闭；使用全新的临时浏览器上下文，不读取玩家存档或日常浏览器配置。它在 `/last-beacon-complete/` 项目子路径验收内联 Pages 成品，也检查源码入口和断网单文件。验证记录与临时截图输出到被忽略的 `.runtime/browser/`。默认不改 README 截图；显式设置 `UPDATE_SCREENSHOTS=1` 才将这次真实截图写入 `docs/images/`。

如使用已安装但不在项目内的 Playwright，可通过 `PLAYWRIGHT_PACKAGE` 指定其完整包路径。浏览器驱动、依赖和执行环境需要单独准备。自动交互不替代真人游戏难度、真实手机或声音体验评测。

默认使用 Playwright 管理的 Chromium。设置 `BROWSER_CHANNEL=chrome` 可改用本机已安装的 Chrome，仍会创建临时独立配置，不使用日常浏览器存档。
