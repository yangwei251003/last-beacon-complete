# 余烬灯塔 · Last Beacon Complete

一座海岛灯塔，一张需要你调度的电网。先建防线，再接通备用线路；风暴切断主路时，让电池和有限的功率撑住最后一波。

**基于 [stackloomdev / Last Beacon](https://github.com/stackloomdev/last-beacon) 的 MIT 改编版**，保留原作者署名。当前扩展采用 Canvas 2D，加入中文八章战役、简化微电网策略、章节解锁、存档与离线单文件交付；八章共享海岛布局，敌潮、供电约束和视觉主题逐步变化。

![本公开副本真实运行的主菜单](docs/images/menu.png)

## 直接游玩

[打开 GitHub Pages 游戏](https://yangwei251003.github.io/last-beacon-complete/)。无需账号、后端或在线素材服务，桌面键鼠体验优先。

源码也能直接运行。需要 Node.js 20 或更高版本，无 npm 运行依赖：

```powershell
git clone https://github.com/yangwei251003/last-beacon-complete.git
cd last-beacon-complete
npm start
```

在浏览器打开终端显示的本机地址。默认是 `http://127.0.0.1:4196`；按 Ctrl+C 关闭。端口占用时先关闭占用进程，或设置 `PORT` 为其他空闲端口再启动。

完全离线游玩可先执行 `npm run build`，再用 Chrome/Edge 打开生成的 `dist/last-beacon.html`。它内联全部运行模块和样式，不访问 CDN。`dist/source/` 保存完整可再构建源码；Git 仓库保留源码和文档，构建包由命令或 Pages 工作流生成。

## 怎么玩

主菜单选择“启程 · 群岛战役”，从已解锁章节进入。选择底部设施，再点基座、确认建造；准备好后迎接潮汐。暂停仍可建造、升级和调度电网。

| 操作 | 功能 |
|---|---|
| 左键基座 / 底部按钮 | 选择与建造设施 |
| 1–6 / 左右方向键 / Enter | 选择设施、切换基座、确认建造或开波 |
| Space / F | 暂停继续 / 1×和2×速度 |
| G / Shift+点击线路 | 电网面板 / 选中线路 |
| Q / E后点击地面 / B | 超频 / 聚光打击 / 光束指向关键敌人 |
| H / Esc / 右键 | 手册 / 暂停或取消 / 取消选择 |

青色线路表示已供电，灰色表示隔离，橙色提示功率不足。连通不代表功率充足；电池的储能与最大输出也分别受限。备用联络需要主动合闸，错误接法可能再次压垮支路。每章可重试，已有通关记录保留。

![本公开副本真实运行的战场与电网面板](docs/images/battle.png)

## 内容与技术

- 八章战役、沙盒、三档难度、失败重试、设置、续玩与战役结局。
- 四类炮塔、中继灯站、电池、升级、目标策略、光束、两类主动技能。
- 支路预算、优先级、故障预告、保护跳闸/复位、孤岛供电和电池能量约束。
- JavaScript ES Modules、Canvas 2D、Web Audio、浏览器本地存储；构建、服务器与测试只使用 Node 内置模块。

这是为塔防节奏缩放的**游戏供电预算模型**，不求解真实电压、电流、潮流或保护整定，不能用于电气工程设计。

## 存档、声音与平台

战役进度、设置和快照只保存在当前浏览器本地，不上传。GitHub Pages、本机 HTTP 和 `file://` 属于不同存储空间，进度不会自动共享；清理网站数据会删除存档。禁用存储时仍可运行，但不能保证退出后保留进度。声音由浏览器合成，可能需要先点击页面才播放。

窄屏布局有自动检查；本项目仍优先桌面操作，不承诺真实手机、手柄、多种 GPU 或声卡均已验收。三档难度有确定性策略检查，难度是否适合真人仍待玩家反馈。

## 测试与构建

```powershell
npm test
npm run build
```

本次迁移的实际验证见 [TEST-REPORT.md](TEST-REPORT.md)。历史交付报告另存于 `docs/history/`，不与本次复验混淆。子路径、单文件、断网与浏览器交互的验收脚本在 `scripts/verify-browser.mjs`，需要另外安装 Playwright 后运行，详见 [验证说明](docs/verification.md)。

```text
src/          战斗、战役、供电、存档、绘图、声音与界面
tests/        现有规则、存档与离线构建测试
scripts/      可复现的浏览器验收
docs/         真实运行截图、验证与历史说明
build.mjs     零依赖离线构建器
server.mjs    仅监听回环地址的可选静态服务器
```

## 来源、许可与后续

固定原作提交为 [`ad531d2d254dfb2b5430c9fbe7e73a1907a17e8f`](https://github.com/stackloomdev/last-beacon/tree/ad531d2d254dfb2b5430c9fbe7e73a1907a17e8f)。原作者 MIT 版权与全文保存在 [LICENSE](LICENSE)，扩展仍采用 MIT。程序化图形、系统字体和合成音效的边界见 [SOURCES.md](SOURCES.md) 与 [第三方声明](THIRD_PARTY_NOTICES.md)。未分发原作研究用 Three.js、候选 Kenney/Library 素材或商业游戏资产。

当前是可游玩的 1.0 扩展版；迁移与待办见 [CHANGELOG.md](CHANGELOG.md)。后续主要收集真人难度与触屏反馈，持续处理兼容性问题，不将自动通关等同于完整真人评测。
