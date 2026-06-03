# x-browser

可视化 Chromium 多 Profile 隔离工作台。

每个 Profile 拥有独立的用户数据目录、Cookie、代理和插件，通过可见 Chromium 窗口运行，支持反检测指纹隔离。

## 功能

- 多 Profile 管理：独立 Chromium 环境，Cookie/缓存/代理完全隔离
- 可见窗口模式：所有操作在真实浏览器窗口中进行，非 headless
- 反检测/指纹隔离：Canvas、WebGL、WebRTC、Navigator 等指纹混淆
- 代理管理：支持 HTTP/SOCKS5 代理，按 Profile 独立配置
- 插件系统：支持 CRX 和 unpacked extension 导入
- 平台管理：内置常用平台，支持自定义
- 任务自动化：基于 CDP 的 Site Adapter 采集框架

## 技术栈

- 前端：React 19 + TypeScript + Vite
- 后端：Rust (Tauri 2)
- 浏览器：Chromium (via Playwright)
- 通信：CDP (Chrome DevTools Protocol)

## 安装运行

### 从 .dmg 安装（推荐）

下载 Release 中对应你 Mac 架构的 DMG：
- Apple Silicon (`M1`/`M2`/`M3`/…): `x-browser_1.2.0_aarch64.dmg`
- Intel: `x-browser_1.2.0_x86_64.dmg`
- 一份同时覆盖两者的 universal DMG: `x-browser_1.2.0_universal.dmg`

挂载后把 `x-browser.app` 拖到 Applications。第一次启动如果被 Gatekeeper 拦住，
到「系统设置 → 隐私与安全性」点「仍要打开」即可。签名 + 公证都通过的话不会弹这个。

如果你拿到的 DMG 装上后是 v1.1.x 升级上来的，注意 [Bundle ID 已从
`com.yanpinquan.x-browser` 改为 `com.xbrowser.app`](docs/macos-distribution.md#bundle-id-变更--旧数据迁移)，
本地 Profiles / Platforms / Tasks 不会自动迁移，看上面的迁移小节操作一次即可。

### 从源码开发

### 重建：

rm -rf src-tauri/target dist
npm run tauri dev

```bash
# 前置条件：Node.js 18+, Rust 1.70+
npm install
npm run browser-install
npm run tauri dev
```

### 构建 .dmg

本地（macOS）签名 + 公证 + 打包的全套流程见
[docs/macos-distribution.md](docs/macos-distribution.md)。最常用的一行：

```bash
cd .worktrees/feat-macos-distribution
./scripts/install-cert-macos.sh
# 首次会要 macOS 密码 + App-Specific Password；之后 ./scripts/build-macos.sh 就能复用
```

产物在 `src-tauri/target/<arch>/release/bundle/dmg/`。

CI 走 universal DMG + 签名 + 公证：`.github/workflows/release-macos.yml`，给 `v*` tag
推上去就在 GitHub Releases 自动出 DMG。

## License

[MIT](LICENSE)
