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

下载 Release 中的 `x-browser_1.0.0_aarch64.dmg`，双击挂载后拖拽到 Applications。

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

```bash
npm run tauri build
# 产物位于 src-tauri/target/release/bundle/dmg/
```

## License

[MIT](LICENSE)
