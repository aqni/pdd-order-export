# 贡献指南

本文面向开发者和编码代理，按准备环境、修改代码、验证和交付的顺序组织。使用与安装见 [README](README.md)。

## 开发环境

需要 Node.js 22.12+（22 系列）、24 系列或 26+，以及 npm。首次准备：

```sh
npm ci
npx playwright install --only-shell chromium
npm run check
```

Linux CI 使用 `npx playwright install --with-deps --only-shell chromium`，同时安装系统库。本机可使用已安装的 Edge；PowerShell 设置 `$env:PLAYWRIGHT_CHANNEL='msedge'` 后运行测试。CI 默认使用 Playwright 配套 Chromium。

| 命令                       | 用途                                       |
| -------------------------- | ------------------------------------------ |
| `npm run dev`              | 在回环地址 5173 启动用户脚本开发服务       |
| `npm run build`            | 在 dist 中构建用户脚本                     |
| `npm run preview`          | 在回环地址 4173 预览构建产物，供手动安装   |
| `npm run typecheck`        | 检查应用、配置、测试及只读边界的类型       |
| `npm run test:unit`        | 运行 Node/jsdom 单元与组件测试，无需浏览器 |
| `npm run test:integration` | 运行 Node 流水线、实际 Vite 服务及代理测试 |
| `npm run test:browser`     | 先构建，再运行真实浏览器测试               |
| `npm test`                 | 先构建，再运行所有 Vitest project          |
| `npm run format`           | 排版源码、测试与文档                       |
| `npm run check`            | 依次执行类型检查、构建、全部测试和格式检查 |

### 调试用户脚本

运行 `npm run dev`，通过 Vite 页面或 `/__vite-plugin-monkey.install.user.js` 安装带「server:」前缀的开发脚本，再访问官网订单页。脚本管理器需要允许本地开发连接；若页面策略限制该方式，可构建后安装正式产物。只启用一个版本。

开发和发布脚本均只匹配官网订单页，不匹配 localhost 或子 frame。DOM 就绪时机由脚本管理器的 document-end 控制；入口只挂载面板。JavaScript 更新由 Vite 刷新页面，CSS 通过插件的 `?style` 支持 Shadow DOM 内热更新。不维护另一套 debug 构建，也不修改 DNS。

元数据集中在 vite.config.ts，版本由 vite.version.ts 使用 git-describe 从 Git 推导，描述和许可证读取 package.json，monkey 插件保持最后。构建需要 Git 和含提交历史的检出目录；下载的源码 ZIP 没有 Git 元数据，不能直接推导版本。构建语法目标为 ES2022；运行环境还须支持 JSON.parse 的 reviver context.source、JSON.rawJSON 及 JSON.isRawJSON，不提供手写解析器或静默舍入的降级。显式不压缩并保留注释，便于在脚本管理器中阅读。src/env.d.ts 仅声明 `?style` 导入类型，不生成运行时代码。

### 本地反向代理

`npm run proxy` 在 `http://localhost:3000` 提供拼多多代理，供受站点访问限制的工具使用，也可用于调试。指定端口为 `npm run proxy -- --port 3001`；若终端没有正确转发参数，使用 `node node_modules/vite/bin/vite.js --config vite.proxy.config.ts --port 3001`。

代理独立于用户脚本开发服务。它监听回环地址、严格检查端口，拒绝其他 Host 和外部 Origin，所有路径转给固定上游，不提供仓库文件。保留 TLS 校验、响应正文、压缩、CSP/HSTS 和 Cookie 安全属性，重写本地域 Cookie 与跳转，响应设为 no-store；错误日志只输出固定提示。正文中的绝对链接和其他域名接口可能返回官网。本地登录态与官网隔离，代理本身不提供导出界面。

## 代码组织

用户脚本没有运行时外部依赖，不配置 @require、externalGlobals 或 ESM 转换服务。现有 npm 依赖仅用于开发与测试；引入运行时依赖前应先讨论必要性、维护状态、许可证和构建成本。

| 位置                                         | 职责                                                             |
| -------------------------------------------- | ---------------------------------------------------------------- |
| src/api/client.ts、http.ts                   | 站点协议及详情校验、游标编码、超时重试与取消                     |
| src/core/                                    | 采集流程、分页完整性、无损 JSON 数值、日期、整数分金额和共享类型 |
| src/export/normalize.ts                      | 提取及规范化字段，保留结构化商品和整数分金额                     |
| src/export/format.ts、csv.ts、serialize.ts   | 显示格式、有序列、CSV 编码及 JSON/文件构造                       |
| src/export/download.ts                       | 原生 Blob 下载与对象 URL 清理                                    |
| src/ui/session.ts、model.ts                  | 无 DOM 任务会话及展示状态契约                                    |
| src/ui/form.ts、result.ts、panel.ts、view.ts | 独立表单与结果组件、面板装配及对话框                             |
| tests/                                       | 合成或已脱敏测试及样本来源说明                                   |
| vite.version.ts                              | 从 Git tag、提交距离及工作区状态推导脚本版本                     |
| dist/                                        | 构建生成的用户脚本，已忽略，不提交到 Git                         |

保留 api / core / export / ui 职责分类。使用明确命名、花括号和直接控制流程；不以行数或文件数量衡量简洁，不维护自制模板、通用状态或事件分派框架。清洗、格式化和 CSV 编码分开，转换不修改解析后的原始记录。

表单、结果和面板采用标准自主自定义元素，各自拥有 Shadow Root。构造函数只创建 Shadow Root；连接时初始化，断开时清理任务和节点。静态模板只包含项目源码，动态值通过 textContent 和 DOM 属性更新。

表单草稿只存于原生控件，通过 running 属性接收忙碌状态，通过带类型的 CustomEvent 上报提交、取消；结果通过 state 属性接收状态，上报下载意图。面板只装配事件与会话。任务状态更新不重建表单，关闭对话框不取消任务，移除面板则取消并销毁会话；旧会话的异步完成不得覆盖新会话。

采集过程内部拥有可变结果，传给展示层和导出函数的是嵌套只读类型，包括原始字段、数组、配置及进度。类型检查约束调用方，不代表运行时深冻结；不为每次进度回调深拷贝整个结果。

界面采用浏览器默认控件、system-ui 和 medium 系统字号。设置和结果分别用原生 fieldset/legend 分组，保留默认边框；常用的详情选项直接显示，高级选项仅收纳分页设置。结果日期取自任务快照，不随表单草稿改变；空结果不显示零金额。手写样式仅用于 Shadow DOM 隔离、必要间距、响应式布局及错误警告。日期与数值输入成对横排，窄屏换行；说明和统计默认折叠，异常及不完整提示直接可见。列表总量未知时使用不定进度，详情仅展示当前页已处理请求数，不计算总百分比。

## 接口、精度与完整性

当前 UID 从当前页面的 pdd_user_id Cookie 读取，每次任务重新检查，保持字符串；缺失、异常或冲突时提示重新登录。不持久化 UID 或登录凭据。

- 列表：同源 POST `/proxy/api/api/aristotle/order_list_v4?pdduid=…`，正文为 size 及后续 offset。响应必须有 orders 数组，每条订单有非空字符串 order_sn；下一页使用末条 offset，允许数值零。分页游标作为独立的 JSON 文本传递，保留原始类型及精确数字字面量，不使用导出记录中的数字字符串重建请求；对象键排序后用于重复检测。
- 详情：同源 GET `/order.html?order_sn=…`，从 script 内提取 window.rawData.data 的 JSON，不执行页面代码。orderSn 必须与请求订单一致，orderDescList 必须是数组，否则标记详情失败并保留列表。
- 精度：使用原生 JSON.parse 的 reviver context.source 读取数字原文。安全整数字面量保持普通 number；其他数字用原生 JSON.rawJSON 保留精确字面量，JSON.stringify 时仍输出数字，字符串也仍输出字符串。原生数值对象只用于数值，不作为业务记录或新增字段；不支持这些原生能力的浏览器明确报错。
- 金额：使用 number 按整数分计算，单笔金额须为非负安全整数，累计求和也检查安全整数范围。文本 199.0、1.99e2 可精确解释为 199 分；非整数不四舍五入。无效或越界金额在 CSV 留空，界面提示未计入合计；累计溢出时显示合计超出安全计算范围。原始值始终保留在 JSON。
- 遍历：只有有效空页表示列表结束；短页不代表结束。不依赖未经证实的排序提前停止。缺失或重复游标、整页无新订单、达到上限均标记不完整。
- 筛选：按编号去重，日期取订单号开头 YYMMDD，解释为 2000–2099 年，两端包含。日期不限时保留无法识别日期的订单；启用筛选时排除并计数，标记不完整。
- 请求：串行，首次以外每次请求前等待 600 ms。每次尝试的请求与响应体共用 20 秒超时，最多尝试三次；只重试网络错误、超时、408、429 和 5xx。Retry-After 超过 30 秒则停止，401/403 立即停止。
- 取消：信号贯穿请求、响应体、退避和任务等待。整页列表先保存，再逐笔读取详情；取消和错误保留已收到的数据。

`complete` 只表示收到有效空页，且选中数据未发生详情失败或日期排除，不代表历史绝对完整或账单已经对账。完整非空结果自动发起下载；空结果不生成文件，部分结果由用户手动下载。不完整文件名含 `_不完整`。

### 导出协议 v1

CSV 使用 UTF-8 BOM、CRLF，一行一个订单，列顺序固定。缺失字段留空，缺失金额不写成零。

| 列                                     | 来源                                                     |
| -------------------------------------- | -------------------------------------------------------- |
| 订单编号、估算日期（订单号）           | order_sn 及其日期前缀                                    |
| 店铺、商品、订单状态                   | mall.mall_name、order_goods、order_status_prompt         |
| 订单金额（元）                         | order_amount，精确整数分转两位小数                       |
| 支付方式、下单时间、物流公司、快递单号 | orderDescList 同名字段，兼容末尾中英文冒号；同名首项优先 |
| 详情状态、结果完整性                   | 获取状态及任务完整性                                     |

订单号、快递单号和长数字文本（包括超长小数金额）加前置单引号，避免表格软件自动转换。公式前缀（含前导空白）同样保护，再统一转义双引号并包裹单元格。单引号在部分导入器中可能显示，再次另存可能改变保护，参见 [OWASP CSV Injection](https://owasp.org/www-community/attacks/CSV_Injection)。

JSON 包含 schemaVersion、起止时间、配置、reason、complete、消息、进度和 entries；每项保存 order、detail（可为 null）及 detailStatus。备份解析后的结构和数值：字段及数组保留，数字不改为字符串、不舍入。原生 JSON 数值对象由 JSON.stringify 直接写为数字字面量，不输出内部 rawJSON 属性。JSON.parse 的标准语义仍适用，例如重复键只保留最后一项；排版、转义写法和完整 HTML 不属于备份范围，不能称为响应正文的逐字备份。不要在记录内注入额外展示字段。读取备份也须使用无损解析方式；普通 JavaScript JSON.parse 仍可能把超出 number 精度的数值舍入，参见 [JSON.rawJSON 的原生数值保真说明](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/rawJSON)。文件名不含账号 UID。

## 测试与 CI

所有测试由 Vitest 运行，真实浏览器使用 Playwright provider，不使用独立 Playwright Test 配置。配置集中在 vitest.config.ts，普通测试不加载 monkey 插件；Vite 服务集成测试显式启动它。

| 层级           | 位置                     | 负责验证                                                          |
| -------------- | ------------------------ | ----------------------------------------------------------------- |
| 纯逻辑与会话   | tests/*.test.ts          | 协议、精度、金额、日期、重试、分页、数据保留、取消及下载策略      |
| 独立组件与装配 | form、result、panel 测试 | 属性与事件契约、展示、草稿保留、面板接线及连接清理                |
| 类型边界       | tests/*.typecheck.ts     | 展示层不能修改结果及嵌套原始字段，由 tsc 检查                     |
| Node 集成      | tests/integration/       | 脱敏样本跨 HTTP/API/采集/导出的贯通；实际 Vite 服务及反向代理     |
| 真实浏览器     | tests/browser/           | 正式产物执行、原生控件及布局、实际下载、原生 fetch 取消、网络隔离 |

新增 case 放在能独立验证该行为的最低层级。会话测试负责下载与任务策略，组件测试负责事件及展示；跨层只保留必要的装配验证。不重复搬运边界值矩阵，也不固定各层测试数量。涉及真实浏览器行为或新增跨模块契约时，可以增加对应场景。

Node 流水线通过 collectOrders 的间隔参数设为 0；浏览器使用最小合成订单，不改变生产请求间隔。服务测试监听回环地址和系统分配端口，结束后关闭，不复用或停止已有开发服务。

浏览器在 Vitest iframe 内加载正式构建的 .user.js，网络边界返回合成响应。Node 自定义命令仅负责受控网络、协议记录和实际下载读取；不接受任意文件路径。应用的外部及非预期请求（包括子 frame）均拒绝，Vitest 通信单独放行。下载读取字节与 JSON 后删除临时文件，不写入真实账单目录。

Provider 按文件隔离上下文；同一文件内每次清理面板、请求夹具、Cookie、下载、视口和输入状态。先取消组件工作，再释放网络等待。不要用固定等待、失败重试或真实账号依赖掩盖不稳定性。参考 [Playwright 测试建议](https://playwright.dev/docs/best-practices)、[下载验证](https://playwright.dev/docs/downloads)及 [Vitest 自定义命令](https://vitest.dev/api/browser/commands)。

GitHub Actions 使用 npm ci、配套 Chromium 和完整 check，并上传本次构建的用户脚本产物。CI 支持 PR、手动触发及工作流调用；发布 Release 时由 Release 工作流调用 CI，分支或 tag 推送不单独触发 CI。失败诊断写入 test-results，CI 上传后保留七天；这些截图和 trace 只能包含合成测试，不得用于真实登录态录制。

## 数据保护与协议证据

测试及 CI 只使用合成或已审查的脱敏数据，不访问官网、不读取账号 secrets、不采集真实账单。真实订单、Cookie、UID、地址、手机号、HAR 和账单不得提交；private 为本机忽略目录，不是可公开的测试样本源。反馈问题前先脱敏。

当前脱敏样本来源和替换规则见[样本记录](tests/fixtures/pdd/PROVENANCE.md)。它保留两页节选、字符串游标及三笔不同详情的关联；末尾空页和 HTML 容器是合成补充。更新样本应记录日期、来源 URL、方法参数、结构、脱敏与核对范围，并明确标记合成字段；不得包含真实账号参数。

2026-10-17 的授权采集曾核对实际请求、列表游标、详情提取和逐笔结果一致性，仅适用于当时账号与协议。本轮解析和校验修复通过离线回归后，仍需另行验证线上登录态；脚本管理器安装和官网 CSP 尚未验证。Windows Edge 本地通过不等于 GitHub Actions Linux runner 已执行。

非公开接口可能变化，订单号日期与金额仍有业务口径限制。任务仅存在页面内存，无断点续传；默认上限 100 页 × 10 条，硬上限 500 页 × 50 条，增大上限不构成完整性保证。

## 提交与发布

修改后运行 `npm run check`。dist 由构建生成，不提交到 Git，也不直接编辑；依赖声明、锁文件同步。说明用户可见变化、验证结果及未验证范围，不能用离线回归声称安装、CSP 或线上协议已验证。

package.json 不维护版本。tag 沿用旧版的日期格式，如 `v2026-10-18` 或 `v2026-10-18.1`，脚本版本去掉 `v`。新版本须高于 Greasy Fork 现有版本，数字段不要补前导零。构建需要完整 Git 历史与 tags。

开发版本类似 setuptools-scm：`v2026-10-18.1` 后第 3 次提交为 `2026-10-18.2.dev3+g<hash>`，无修订号时从 `.1` 开始；没有 tag 时为 `0.1.dev<提交总数>+g<hash>`。未提交改动附加 UTC 日期标记 `dYYYYMMDD`。开发版本不上传到 Greasy Fork。

正式发布流程：

1. 推送已检查的源码，在 GitHub 创建正式 Release，选择或新建指向目标提交的版本 tag，填写标题和更新日志。
2. Release 发布后校验 tag，调用 CI 构建并运行完整 `npm run check`。预发布跳过，tag 格式错误则失败；推送 tag 或编辑 Release 不触发。
3. 检查通过后，将同一份 `userscript` 产物上传为 `.user.js` 附件，保留标题和更新日志。已有同名附件时失败，不自动覆盖。确认附件上传成功后再同步 Greasy Fork。

目标 tag 必须包含两个工作流，且 `ci.yml` 声明 `workflow_call`。遇到 `Unable to find reusable workflow`，先检查 tag 中的文件；修复后用新 tag 发布，重跑旧 tag 不会获得后续配置。发布使用内置 `GITHUB_TOKEN`，无需个人令牌。

Greasy Fork 同步需登录原脚本 [581924 的管理页](https://greasyfork.org/zh-CN/scripts/581924/admin)，将代码同步 URL 配置为：

```text
https://github.com/aqni/pdd-order-export/releases/latest/download/pdd-order-export.user.js
```

启用自动定时同步，并将目标 Release 标记为 Latest。首次同步后核对版本、代码和安装更新。更新日志需手动从 Release 复制到 Greasy Fork 对应版本；附加信息独立维护。

本仓库不提交 dist，因此使用附件定时同步；Greasy Fork Release Webhook 从 tag 的仓库文件读取脚本，不读取附件。参考 [Greasy Fork 同步说明](https://greasyfork.org/en/help/api)和 [GitHub Release 事件](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#release)。

首次替换旧公开版前，核对 `@name`、`@namespace` 和递增版本，并完成脚本管理器升级、官网 CSP 及线上登录态核验。不要自动设置旧公开版更新地址，避免被旧版本覆盖。推送、打 tag 和发布均需明确授权。
