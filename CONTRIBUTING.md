# 贡献指南

## 开发

使用 Node.js 24 系列，以及 Chrome／Edge 136+。TypeScript 使用 ES2025 标准库，Vite 按 `chrome136` 构建，不提供旧浏览器兼容层。构建版本由 Git 推导，克隆时保留完整历史和 tags。

```sh
npm ci
npm run dev
```

在自动打开的页面安装开发脚本，再访问[拼多多订单页](https://mobile.pinduoduo.com/orders.html)。本地页面用于安装开发脚本，面板在官网订单页运行，源码由 Vite 提供并支持热更新。Tampermonkey 和浏览器需要允许官网连接本地开发服务，开发版与正式版只启用一个。更改开发端口后需重新安装开发脚本。

如果控制台提示 `Permission was denied ... loopback address space`，在拼多多订单页点击地址栏左侧的站点信息图标，进入站点权限，将“回环网络访问”（部分版本显示为“本地网络访问”）设为允许，再刷新订单页。这项权限授予 `https://mobile.pinduoduo.com`；开启代理、允许扩展访问本地文件或单独打开 `127.0.0.1:5173` 均不能替代它。开发入口由网页加载，修改 Vite 的 CORS 响应头也不能替代浏览器授权，详见 [vite-plugin-monkey 的本地网络说明](https://vite-plugin-monkey.pages.dev/guide/notes#local-network-access)。

修改样式会即时更新；修改 TypeScript／TSX 会重新挂载面板，重置表单和收集结果，并中止正在进行的收集。正式构建的脚本仍只匹配官网订单页。

正式构建与预览：

```sh
npm run build
npm run preview
```

产物位于 `dist/`，不压缩并经过排版，不提交到仓库。运行时依赖通过 `vite.config.ts` 的 `externalGlobals` 加载固定版本的官方浏览器产物。安装依赖时保留可选依赖，不使用 `--omit=optional`。

面板使用 Preact 和 TSX。`src/ui/` 按职责划分为 `collect/`、`export/`、`dialog/`，各区域通过 `index.ts` 暴露接口；表单内部组件位于 `collect/form/`。收集区域管理任务、取消与进度；表单集中保存草稿，字段通过 props 接收值，摘要在渲染时由草稿推导。提交统一读取原生表单，校验后转换为采集选项。入口持有结果快照并通过 props 交给导出区域，不通过组件 ref 调用结果更新方法。

`main.ts` 将面板和独立的 `ui/styles.css` 挂载到 Shadow Root，隔离站点样式。样式按组件区域组织，用 `@scope` 限制选择器范围；原生字段和操作按钮共用一个表单树，保留浏览器的约束校验、回车提交和焦点行为。以桌面布局为主，窄屏只做基本防溢出。

优先使用原生控件。弹层通过 `command="show-modal"` 打开，通过 `<form method="dialog">` 或 Esc 收起；收起不停止任务。文件操作由下载组件处理，失败使用原生 `alert`，补充说明使用 `title`。

JSX 编译为 Preact 的 `h` 调用。构建保留许可证和 JSDoc，移除优化注解，再由 Prettier 排版。

## 测试

```sh
npm run check
```

完整检查包含格式、类型、构建和全部测试。分项命令为 `npm run test:unit`、`npm run test:integration`、`npm run test:browser`；浏览器测试需先构建。

浏览器测试使用隔离 Chromium、官方 Tampermonkey 和合成响应，首次运行需要联网。失败截图和 trace 保存在 `test-results/`。Chromium 无法启动时，可设置 `PLAYWRIGHT_CHANNEL=msedge` 使用隔离 Edge 配置。

业务回归案例见[样例约定](tests/fixtures/orders/README.md)。样例需脱敏并独立核对期望结果；真实订单、Cookie、UID、地址、手机号及 HAR 仅保存在本机忽略目录。提交说明中区分离线测试和登录官网核验。

CSV 会为公式前缀文本添加单引号，避免表格软件将其作为公式求值；JSON 保留解析后的原始字段。导出文件按本次收集快照的日期范围命名，例如 `拼多多账单_2026-10-01至2026-10-24.csv`，未指定的日期用“不限”表示，部分结果追加 `_不完整`；之后修改表单草稿不影响已收集结果的文件名。

`collectOrders(source, options, signal)` 是两级异步迭代器：外层按需请求分页并筛选，每页产出 `{ total, orders }`，`total` 表示本页筛选后的订单数，`orders` 是按配置逐笔获取详情并产出订单的异步迭代器，不会提前请求详情。日期边界使用表示 UTC 日期的 `Date | null`，`null` 表示不限；收集器入口使用 Typia 原生约束断言类型与分页参数（每页条数和页数使用 uint32 数值约束，允许 0，每页最多 50 条），不校验起止日期前后关系；表单使用自己的控件校验，要求每页条数和页数至少为 1。UI 根据两层迭代累计进度，自行保存已产出的条目：页内以已产出数／本页总数显示相对进度，等待列表响应时使用不定进度，不估算全部历史订单的完成比例。取消与请求失败均向外抛出，`PddClient` 负责中断请求和等待，消费方通过 `break` 停止后续迭代。达到页数上限时，UI 保守地标记为部分结果。JSON 只导出条目数组，不包含选项、进度、时间戳或结束原因。

## 发布

版本号使用日期 tag：`vYYYY-MM-DD`，同日修订依次为 `.1`、`.2`，不补前导零。构建直接使用 `absolute-version` 从 Git 推导版本：干净的日期 tag 保留原名及 `v` 前缀，其他构建追加分支、提交距离和哈希；工作区有修改时追加 `.SNAPSHOT.<主机名>`。新版本应高于 Greasy Fork 当前版本，CI 不校验 tag。

1. 完成检查并推送代码，从包含发布工作流的提交创建 GitHub Release，填写 tag 和更新日志。
2. 等待 CI 检查通过，工作流会自动上传构建的 `.user.js`。
3. 将 Release 标记为 Latest，确认 Greasy Fork 同步结果。

在[脚本管理页](https://greasyfork.org/zh-CN/scripts/581924/admin)配置定时同步，代码 URL 为：

```text
https://github.com/aqni/pdd-order-export/releases/latest/download/pdd-order-export.user.js
```
