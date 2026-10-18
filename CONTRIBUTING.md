# 贡献指南

## 开始开发

需要 Git、npm，以及 Node.js 22.15+（22 系列）、24 系列或 26+。克隆时获取完整历史和 tags，然后运行：

```sh
npm ci
npm run dev
```

在自动打开的安装页安装开发脚本，再访问拼多多订单页。脚本管理器须允许本地连接，开发版与正式版只启用一个。

`npm run build` 生成正式脚本，`npm run preview` 在端口 4173 提供安装页。`dist/` 不提交，也不直接编辑。依赖变更须同步 package-lock.json；保留可选依赖，不使用 `--omit=optional`。首次 Typia 编译可能较慢。

### 本地反向代理

无法直接调试官网时，运行 `npm run proxy`，访问 `http://127.0.0.1:3000`。所有路径原样转发到拼多多，无需构建。自定义端口：

```sh
node node_modules/vite/bin/vite.js --mode proxy --port 3001
```

配置在 `build/proxy.ts`，仅 proxy 模式启用。登录和验证由用户完成；页面中的官网链接可能离开代理，用户脚本仅匹配官网地址。

## 检查与测试

提交前运行：

```sh
npm run check
```

该命令依次检查格式、类型，构建脚本并运行全部测试。常用分项命令：

| 命令                       | 用途                       |
| -------------------------- | -------------------------- |
| `npm run format`           | 格式化                     |
| `npm run format:check`     | 检查格式                   |
| `npm run typecheck`        | 类型检查                   |
| `npm run test:unit`        | 单元测试                   |
| `npm run test:integration` | 集成测试                   |
| `npm run test:browser`     | 篡改猴浏览器测试，需先构建 |
| `npm test`                 | 全部测试，需先构建         |
| `npm run version`          | 查看当前脚本版本           |

测试位于 `tests/unit/`、`tests/integration/`、`tests/browser/`。新增业务案例按[样例约定](tests/fixtures/orders/README.md)提供脱敏数据和独立核对的期望结果。

浏览器测试自动准备隔离 Chromium 和官方 Tampermonkey，首次运行需要联网；测试请求使用合成响应。扩展版本与 SHA-256 固定在 `tests/browser/tampermonkey.json`，失败截图和 trace 写入 `test-results/`。

不提交真实订单、Cookie、UID、地址、手机号或 HAR；敏感数据仅保存在本机忽略目录。提交时说明变更和验证结果，区分离线测试与线上核验。

## 提交与发布

正式 tag 使用 `vYYYY-MM-DD` 或 `vYYYY-MM-DD.N`，日期须有效，修订号 N 不补前导零，版本须高于 Greasy Fork 现有版本。package.json 不维护版本；发布构建使用触发 Release 的 tag，开发构建由 Git 推导版本。

1. 推送已检查的源码，在 GitHub 创建正式 Release，填写 tag 和更新日志。目标 tag 须包含当前工作流。
2. `ci.yml` 完成检查、构建和全部测试，再将同一份 `.user.js` 产物上传为 Release 附件。
3. 将目标 Release 标记为 Latest，核对 Greasy Fork 同步结果。

### Greasy Fork 同步

在[脚本管理页](https://greasyfork.org/zh-CN/scripts/581924/admin)启用定时同步，代码 URL 设置为：

```text
https://github.com/aqni/pdd-order-export/releases/latest/download/pdd-order-export.user.js
```
