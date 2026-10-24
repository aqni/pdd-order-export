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

面板使用 Preact 和 TSX，运行时从固定版本的 npm CDN 地址加载官方 UMD 文件。`src/ui/` 中每个组件独立成文件，目录统一按动作命名：`collect/` 存放收集设置、操作和实时进度，`export/` 负责完成后的结果展示及文件导出。`ui/index.tsx` 是 UI 入口和任务协调组件，`ui/dialog.tsx` 管理整个面板的弹层交互，公共样式保存在 `ui/styles.css`。

`main.ts` 负责挂载；UI 入口只保存 `phase` 和结果快照。阶段为 `idle`、`collecting`、`exporting`，其中 `exporting` 表示收集已结束、可导出的阶段。`CollectControls` 拥有表单、收集任务、取消控制器、进度和错误；`cancelling` 只在组件内部管理，关闭面板时调用其 `cancel()`。组件只通知宿主开始和结束，不向上汇报逐页进度；结束结果为 `null` 时表示失败，错误留在收集区域。`CollectProgress` 位于收集控件内部，只在收集和等待取消期间显示；结束后隐藏整个进度区。`ExportControls` 与收集控件平行，仅在收集结束后显示，接收包含条目、日期边界和完整性标记的结果快照。两个区域使用原生 `hr` 分隔。

弹层组件拥有触发按钮、打开和关闭逻辑、关闭后的焦点恢复，每次关闭只通知一次宿主。操作按钮通过原生 `form` 属性关联表单；表单组合日期范围、详情开关和请求设置，只负责校验与提交。日期输入封装空值提示，日期范围负责跨字段校验。导出组件内部处理文件操作，失败时通过原生 `alert` 提示，成功时由浏览器下载列表反馈。补充说明使用原生 `title`，多项说明以完整句子分段组织。UI 组件统一使用 `Collect…` 和 `Export…` 命名。

JSX 编译为 `createElement` 调用。构建保留许可证和 JSDoc，移除优化注解，再由 Prettier 排版。

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

CSV 会为公式前缀文本添加单引号，避免表格软件将其作为公式求值；JSON 保留解析后的原始字段。导出文件按本次收集快照的日期范围命名，例如 `拼多多账单_2026-10-01至2026-10-24.csv`，未指定的日期用“不限”表示，部分结果追加 `_不完整`；之后修改表单草稿不影响已收集结果的文件名。

`collectOrders(source, options, signal)` 是两级异步迭代器：外层按需请求分页并筛选，内层按配置逐笔获取详情并产出订单。日期边界使用表示 UTC 日期的 `Date | null`，`null` 表示不限；收集器入口使用 Typia 原生约束断言类型与分页参数（每页条数和页数使用 uint32 数值约束，允许 0，每页最多 50 条），不校验起止日期前后关系；表单使用自己的控件校验，要求每页条数和页数至少为 1。UI 根据两层迭代累计进度，自行保存已产出的条目；取消与请求失败均向外抛出，`PddClient` 负责中断请求和等待，消费方通过 `break` 停止后续迭代。达到页数上限时，UI 保守地标记为部分结果。JSON 只导出条目数组，不包含选项、进度、时间戳或结束原因。

## 发布

版本号使用日期 tag：`vYYYY-MM-DD`，同日修订依次为 `.1`、`.2`，不补前导零。新版本应高于 Greasy Fork 当前版本，`npm run version` 可查看 Git 推导的版本号。

1. 完成检查并推送代码，从包含发布工作流的提交创建 GitHub Release，填写 tag 和更新日志。
2. 等待 CI 检查通过，工作流会自动上传构建的 `.user.js`。
3. 将 Release 标记为 Latest，确认 Greasy Fork 同步结果。

在[脚本管理页](https://greasyfork.org/zh-CN/scripts/581924/admin)配置定时同步，代码 URL 为：

```text
https://github.com/aqni/pdd-order-export/releases/latest/download/pdd-order-export.user.js
```
