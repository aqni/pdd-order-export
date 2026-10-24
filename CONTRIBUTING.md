# 贡献指南

## 开发

使用 Node.js 24 系列、Chrome／Edge 136+。TypeScript 使用 ES2025 标准库，Vite 按 `chrome136` 构建，不提供旧浏览器兼容层。克隆时保留完整 Git 历史和 tags，以便推导构建版本。

```sh
npm ci
npm run dev
```

在自动打开的页面安装开发脚本，再访问拼多多订单页。Tampermonkey 需要允许本地连接，开发版与正式版只启用一个。安装依赖时保留可选依赖，不使用 `--omit=optional`。

```sh
npm run build
npm run preview
```

构建生成两个版本，只需安装其中一个。产物位于 `dist/`，保留许可证和 JSDoc，不压缩并经 Prettier 排版，不提交到仓库。

- `pdd-order-export.user.js`：通过 `@require` 加载固定版本的运行时依赖。
- `pdd-order-export.standalone.user.js`：独立版，内置全部运行时依赖，无 `@require`。

普通版的 Lit 来自 [Greasy Fork 库](https://greasyfork.org/scripts/601930)。构建通过公开 API 匹配本地安装版本，解析固定下载地址和全局导出对象，缓存于 `node_modules/.cache/userscript-libraries/`。首次构建或升级 Lit 需要联网；缺少对应版本时构建失败。开发模式和独立版直接使用 npm 包。

业务逻辑位于 `src/pdd.ts`、`src/collect.ts`、`src/export.ts`。`src/ui/` 使用 Lit，按组件语义组织模板、局部样式、控制逻辑和状态；区域通过 `index.ts` 暴露接口。优先使用原生控件和 DOM 状态，Lit 的 `html` 模板以换行开始和结束，由 Prettier 排版。

样式与组件同文件，使用 `css` 模板。区域使用 Shadow DOM 隔离站点样式；表单内部使用 Light DOM 和局部 `@scope`，保持原生表单关联、校验与提交。`@scope` 不提供 Shadow DOM 的双向隔离，容器样式应限制在自身布局。以桌面布局为主，窄屏只做基本防溢出。

### 本地反向代理

无法直接访问官网时，运行 `npm run proxy`，打开 `http://127.0.0.1:3000`。登录和验证仍在浏览器中完成，用户脚本仅匹配官网地址。另开端口可运行：

```sh
node node_modules/vite/bin/vite.js --mode proxy --port 3001
```

## 测试

```sh
npm run check
```

完整检查包含格式、类型、两种构建和全部测试。分项命令为 `npm run test:unit`、`npm run test:integration`、`npm run test:browser`；集成与浏览器测试需先构建。

浏览器测试使用隔离 Chromium、官方 Tampermonkey 和合成响应，覆盖两个构建版本。首次运行需要联网。失败截图和 trace 保存在 `test-results/`；可设置 `PLAYWRIGHT_CHANNEL=msedge` 使用隔离 Edge 配置。

业务回归案例见[样例约定](tests/fixtures/orders/README.md)。样例需脱敏并独立核对期望结果；真实订单、Cookie、UID、地址、手机号及 HAR 仅保存在本机忽略目录。提交说明中区分离线测试和登录官网核验。

导出回归应覆盖：CSV 的安全整数金额校验与公式前缀保护；JSON 保留解析后的条目数组，使用普通 JSON 数值精度；文件名来自收集时的日期快照。停止任务或达到页数上限时标记为不完整结果，收起面板不停止任务。

## 发布

版本号使用日期 tag：`vYYYY-MM-DD`，同日修订依次为 `.1`、`.2`，不补前导零。新版本应高于 Greasy Fork 当前版本，`npm run version` 可查看 Git 推导的版本号。

1. 完成检查并推送代码，从包含发布工作流的提交创建 GitHub Release，填写 tag 和更新日志。
2. 等待 CI 检查通过，工作流会自动上传两个 `.user.js` 产物。
3. 将 Release 标记为 Latest，确认 Greasy Fork 同步结果。

在[脚本管理页](https://greasyfork.org/zh-CN/scripts/581924/admin)配置定时同步，代码 URL 为：

```text
https://github.com/aqni/pdd-order-export/releases/latest/download/pdd-order-export.user.js
```
