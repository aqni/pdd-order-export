# 贡献指南

## 开发

使用 Node.js 24 系列，以及 Chrome／Edge 136+。TypeScript 使用 ES2025 标准库，Vite 按 `chrome136` 构建，不提供旧浏览器兼容层。构建版本由 Git 推导，克隆时保留完整历史和 tags。

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

面板使用 Vue runtime-only 和单文件组件，采用 `<script setup lang="ts">`、`<template>` 和 `<style scoped>`。`src/ui/` 按职责划分为 `collect/`、`export/`、`dialog/`，各区域通过 `index.ts` 暴露接口；表单内部组件位于 `collect/form/`。收集区域管理任务、取消与进度，表单集中保存响应式草稿，字段通过 `v-model` 更新草稿，摘要通过 `computed` 推导。入口以 `shallowRef` 保存结果快照并传给导出区域，避免代理订单数据。

`main.ts` 通过 `defineCustomElement` 创建面板唯一的 Shadow Root，隔离站点样式；内部仍是普通 Vue 组件，不为字段创建额外的 Shadow Root。原生字段和操作按钮共用一个表单树，保留浏览器的约束校验、回车提交和焦点行为。以桌面布局为主，窄屏只做基本防溢出。

组件自己的布局使用同文件的 `<style scoped>`；字体、原生控件基础样式和重复的字段／摘要结构放在 `ui/styles.css`，由面板加载一次。SFC 以官方插件的 custom-element 模式编译，将样式保留为组件的 CSS 字符串；Vue 将面板及子组件的样式注入同一个 Shadow Root，不注入站点文档。`scoped` 通过选择器属性限制组件范围，公共结构样式使用 `@scope`。

优先使用原生控件。弹层通过 `command="show-modal"` 打开，通过 `<form method="dialog">` 或 Esc 收起；收起不停止任务。文件操作由下载组件处理，失败使用原生 `alert`，补充说明使用 `title`。

SFC 通过官方 `@vitejs/plugin-vue` 编译，不在浏览器中编译模板。Vue 通过固定版本的官方 `vue.runtime.global.prod.js` 外置加载；该产物是暴露 `Vue` 全局变量的 IIFE，不是 UMD。构建保留许可证和 JSDoc，移除优化注解，再由 Prettier 排版。

业务源码继续由 TypeScript 7 和 `ttsc` 检查及转换 Typia；SFC 模板另由 `vue-tsc` 检查。当前 Vue 工具链依赖 JavaScript 版 TypeScript API，因此通过 `typescript-vue` 别名使用 TypeScript 6；同一别名也为 SFC 编译器提供解析导入 Props 类型所需的文件系统接口。

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

`collectOrders(source, options, signal)` 是两级异步迭代器：外层按需请求分页并筛选，每页产出 `{ total, orders }`，`total` 表示本页筛选后的订单数，`orders` 是按配置逐笔获取详情并产出订单的异步迭代器，不会提前请求详情。日期边界使用表示 UTC 日期的 `Date | null`，`null` 表示不限；收集器入口使用 Typia 原生约束断言类型与分页参数（每页条数和页数使用 uint32 数值约束，允许 0，每页最多 50 条），不校验起止日期前后关系；表单使用自己的控件校验，要求每页条数和页数至少为 1。UI 根据两层迭代累计进度，自行保存已产出的条目：页内以已产出数／本页总数显示相对进度，等待列表响应时使用不定进度，不估算全部历史订单的完成比例。取消与请求失败均向外抛出，`PddClient` 负责中断请求和等待，消费方通过 `break` 停止后续迭代。达到页数上限时，UI 保守地标记为部分结果。JSON 只导出条目数组，不包含选项、进度、时间戳或结束原因。

## 发布

版本号使用日期 tag：`vYYYY-MM-DD`，同日修订依次为 `.1`、`.2`，不补前导零。新版本应高于 Greasy Fork 当前版本，`npm run version` 可查看 Git 推导的版本号。

1. 完成检查并推送代码，从包含发布工作流的提交创建 GitHub Release，填写 tag 和更新日志。
2. 等待 CI 检查通过，工作流会自动上传构建的 `.user.js`。
3. 将 Release 标记为 Latest，确认 Greasy Fork 同步结果。

在[脚本管理页](https://greasyfork.org/zh-CN/scripts/581924/admin)配置定时同步，代码 URL 为：

```text
https://github.com/aqni/pdd-order-export/releases/latest/download/pdd-order-export.user.js
```
