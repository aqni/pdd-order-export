# 贡献指南

## 开发

使用 Node.js 24 系列，以及 Chrome／Edge 131+。构建版本由 Git 推导，克隆时保留完整历史和 tags。

```sh
npm ci
npm run dev
```

在自动打开的页面安装开发脚本，再访问拼多多订单页。Tampermonkey 需要允许本地连接，开发版与正式版只启用一个。

正式构建与预览：

```sh
npm run build
npm run preview
```

产物位于 `dist/`，不压缩并经过排版，不提交到仓库。运行时依赖通过 `vite.config.ts` 的 `externalGlobals` 加载固定版本的官方浏览器产物。安装依赖时保留可选依赖，不使用 `--omit=optional`。

### 本地反向代理

无法直接访问官网时，运行 `npm run proxy`，打开 `http://127.0.0.1:3000`。登录和验证仍在浏览器中完成，用户脚本仅匹配官网地址。另开端口可运行：

```sh
node node_modules/vite/bin/vite.js --mode proxy --port 3001
```

## 测试

```sh
npm run check
```

完整检查包含格式、类型、构建和全部测试。分项命令为 `npm run test:unit`、`npm run test:integration`、`npm run test:browser`；浏览器测试需先构建。

浏览器测试使用隔离 Chromium、官方 Tampermonkey 和合成响应，首次运行需要联网。失败截图和 trace 保存在 `test-results/`。Chromium 无法启动时，可设置 `PLAYWRIGHT_CHANNEL=msedge` 使用隔离 Edge 配置。

业务回归案例见[样例约定](tests/fixtures/orders/README.md)。样例需脱敏并独立核对期望结果；真实订单、Cookie、UID、地址、手机号及 HAR 仅保存在本机忽略目录。提交说明中区分离线测试和登录官网核验。

## 发布

版本号使用日期 tag：`vYYYY-MM-DD`，同日修订依次为 `.1`、`.2`，不补前导零。新版本应高于 Greasy Fork 当前版本，`npm run version` 可查看 Git 推导的版本号。

1. 完成检查并推送代码，从包含发布工作流的提交创建 GitHub Release，填写 tag 和更新日志。
2. 等待 CI 检查通过，工作流会自动上传构建的 `.user.js`。
3. 将 Release 标记为 Latest，确认 Greasy Fork 同步结果。

在[脚本管理页](https://greasyfork.org/zh-CN/scripts/581924/admin)配置定时同步，代码 URL 为：

```text
https://github.com/aqni/pdd-order-export/releases/latest/download/pdd-order-export.user.js
```
