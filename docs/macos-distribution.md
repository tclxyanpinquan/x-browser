# macOS 打包分发指南

## 一次性准备（已完成）

- [x] Apple Developer 账号付费（`hysen.yan@outlook.com` / `yuchen xiu`）
- [x] Developer ID Application 证书已在钥匙串中（Team ID: `2VH263HBZJ`）
- [ ] App-Specific Password 存到 shell 环境变量
- [x] Bundle ID 改为 `com.xbrowser.app`
- [x] 签名/公证配置写入 `src-tauri/tauri.conf.json`
- [x] `src-tauri/entitlements.plist` 已创建
- [x] `scripts/build-macos.sh` 支持 aarch64 / x86_64
- [x] CI workflow: `.github/workflows/release-macos.yml`

## ⚠️ Bundle ID 变更 & 旧数据迁移

从 v1.1.x → v1.2.0，bundle id 由 `com.yanpinquan.x-browser` 改成 `com.xbrowser.app`。
这意味着旧用户首次打开新版本会看到「空白 Profiles / Platforms / Tasks」，
因为配置文件实际位置变了：

- 旧：`~/Library/Application Support/com.yanpinquan.x-browser/`
- 新：`~/Library/Application Support/com.xbrowser.app/`

需要的话可以一次性手工迁移：

```bash
SRC=~/Library/Application\ Support/com.yanpinquan.x-browser
DST=~/Library/Application\ Support/com.xbrowser.app
if [ -d "$SRC" ] && [ ! -d "$DST" ]; then
  cp -R "$SRC" "$DST"
  echo "Migrated store.json. Remove $SRC after you verify the new build sees it."
fi
```

每个 Profile 的 Chromium `user-data-dir`（`./profiles/<slug>/`）跟 bundle id 解耦，
不在迁移范围内，浏览器登录态不会丢。

## 架构

默认 build 只产生**当前架构**的 DMG（Apple Silicon 跑出 aarch64，Intel 跑出 x86_64）。
想给两类 Mac 都发，参见下文「Universal 二进制」。

### Universal 二进制（一次构建同时支持 aarch64 + x86_64）

Tauri 2.1+ 在 `tauri.conf.json` 里打开：

```jsonc
"bundle": {
  "macOS": {
    "universal": true
  }
}
```

然后：

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run tauri build -- --target universal-apple-darwin
```

产物在 `src-tauri/target/universal-apple-darwin/release/bundle/`。
CI workflow `.github/workflows/release-macos.yml` 已经按 universal 跑，照 `secrets.APPLE_*` 配好即可。

## 生成 App-Specific Password

1. 浏览器打开 https://appleid.apple.com
2. 用 `hysen.yan@outlook.com` 登录（如有 2FA，手机 `19342649924` 收短信）
3. 左侧「App-Specific Passwords」 → 点 `+` → 名字填 `x-browser-notarize`
4. 复制生成的 16 位密码（格式 `xxxx-xxxx-xxxx-xxxx`）

**不要贴到对话里！** 直接存到 shell：

```bash
cat >> ~/.zshrc <<'EOF'

# x-browser notarization (do not commit)
export APPLE_ID="hysen.yan@outlook.com"
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="2VH263HBZJ"
EOF

source ~/.zshrc
```

## 打包

```bash
cd .worktrees/feat-macos-distribution
chmod +x scripts/build-macos.sh
./scripts/build-macos.sh
```

输出：
- App: `src-tauri/target/release/bundle/macos/x-browser.app`
- DMG: `src-tauri/target/release/bundle/dmg/x-browser_1.2.0_aarch64.dmg`

脚本会自动跑 `codesign --verify` / `spctl --assess` / `stapler validate` 验证签名和公证。

## 在其他 Mac 上验证

```bash
# 1. 拷贝 .dmg 到目标 Mac
# 2. 双击安装
# 3. 终端验证
spctl --assess --type install --verbose=2 /Applications/x-browser.app
# 期望输出: accepted

# 4. 检查代码签名
codesign -dv --verbose=4 /Applications/x-browser.app
# 应该看到: Authority=Developer ID Application: yuchen xiu (2VH263HBZJ)

# 5. 检查公证票据
stapler validate /Applications/x-browser.app
# 期望输出: The validate action worked!
```

## 常见问题

### `xcrun notarytool` 报 "Could not find the proper notarization credentials"

环境变量没生效。重开终端或 `source ~/.zshrc` 后跑 `echo $APPLE_PASSWORD` 确认。

### `codesign` 失败 "errSecInternalComponent"

钥匙串被锁。`security unlock-keychain -p <你的开机密码> ~/Library/Keychains/login.keychain-db`

### DMG 在其他 Mac 上"无法验证开发者"

公证失败。跑 `xcrun notarytool log <submission-id>` 看 Apple 的拒绝原因（通常是 entitlements 缺项）。

### 启动后立即崩溃

多半是 entitlements 不够。`Console.app` 搜 `x-browser` 看崩溃日志。
