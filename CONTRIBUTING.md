# 贡献指南

## 开发

使用 Node.js 24 和 Chrome／Edge 136+。克隆时保留完整 Git 历史和 tags，用于推导构建版本。

```sh
npm ci
npm run dev
```

从自动打开的本地页面安装开发脚本，再访问[拼多多订单页](https://mobile.pinduoduo.com/orders.html)。开发版与正式版只启用一个；更改开发端口后需重新安装。

Tampermonkey 和浏览器需允许官网连接本地 Vite 服务。若提示 `Permission was denied ... loopback address space`，在拼多多页面的站点权限中允许“回环网络访问”或“本地网络访问”，再刷新。详见 [vite-plugin-monkey 的说明](https://vite-plugin-monkey.pages.dev/guide/notes#local-network-access)。

样式支持即时更新；TypeScript／TSX 更新会重建面板、重置结果并中止收集。正式脚本仅匹配官网订单页。

正式构建与预览：

```sh
npm run build
npm run preview
```

产物位于 `dist/`，不压缩、经 Prettier 排版，不提交到仓库；保留许可证和 JSDoc，移除优化注解。运行时依赖由 `vite.config.ts` 的 `externalGlobals` 加载固定版本的官方浏览器产物。安装时保留可选依赖，不使用 `--omit=optional`。

`src/pdd.ts` 处理协议，`src/collect.ts` 负责收集，`src/export.ts` 生成文件。`src/ui/` 使用 Preact 和 TSX，按收集、导出、弹层划分职责。表单拥有草稿，收集区域拥有任务与进度，入口将结果快照传给导出区域。

面板及独立 CSS 挂载到 Shadow Root，区域样式使用 `@scope`。优先使用原生表单和弹层，保留校验、回车提交、焦点及 Esc 行为；收起面板不停止任务。

## 测试

```sh
npm run check
```

完整检查包含格式、类型、构建和全部测试。可单独运行 `test:unit`、`test:integration`、`test:browser`；浏览器测试需先构建。

浏览器测试使用隔离 Chromium、官方 Tampermonkey 和合成响应，首次运行需要联网；可设置 `PLAYWRIGHT_CHANNEL=msedge` 改用隔离 Edge。失败截图和 trace 位于 `test-results/`。

业务回归案例见[样例约定](tests/fixtures/orders/README.md)。样例需脱敏并独立核对期望结果；真实订单、Cookie、UID、地址、手机号及 HAR 仅保存在本机忽略目录。提交说明中区分离线测试和登录官网核验。

CSV 防护公式前缀文本，JSON 仅保留解析后的订单条目数组。文件名使用收集快照的日期范围，未指定日期为“不限”，部分结果追加 `_不完整`；之后修改表单不影响已收集结果的文件名。

## 发布

发布 tag 使用 `vYYYY-MM-DD`，同日修订追加 `.1`、`.2`，不补前导零。构建版本由 `absolute-version` 推导；干净的日期 tag 保留 `v` 前缀。新版本应高于 Greasy Fork 当前版本，CI 不校验 tag。

1. 完成检查并推送代码，从包含发布工作流的提交创建 GitHub Release，填写 tag 和更新日志。
2. 等待 CI 检查通过，工作流会自动上传构建的 `.user.js`。
3. 将 Release 标记为 Latest，确认 Greasy Fork 同步结果。

在[脚本管理页](https://greasyfork.org/zh-CN/scripts/581924/admin)配置定时同步，代码 URL 为：

```text
https://github.com/aqni/pdd-order-export/releases/latest/download/pdd-order-export.user.js
```
