# 开发版本与核验证据

记录日期：2026-10-18（Asia/Shanghai）。本文件区分官方发布/依赖声明与当前实现的安装、构建、测试结果；版本符合依赖范围不等于所有运行场景已经验收。只记录已读来源，不将未读取的官方文档写成已核验。

## 当前固定基线

以下精确版本与本地执行状态由主开发流程回传，本研究未重新安装、构建或执行测试：

| 范围 | 固定版本 | 本地状态及证据边界 |
| --- | --- | --- |
| 运行时与包管理器 | Node.js `24.19.0`、pnpm `11.25.0` | 主开发流程已使用。本文未独立读取这两个精确补丁版本的发行元数据；不将其称为官方最新版本。 |
| API | NestJS `12.1.3`、`@nestjs/swagger` `12.0.2`、TypeScript `5.9.3` | 主流程已安装并通过现有后端检查；Nest 官方 tag 已核验，Swagger 精确版本与实际安装状态来自主流程。 |
| 数据访问 | `prisma` / `@prisma/client` `6.19.3`、MySQL `8.4.9` | 主流程报告真实 MySQL 容器健康、迁移与 15 项集成测试通过。本文未自行复跑；不以模拟数据库代替该结果。 |
| 小程序与 H5 | Taro 系列 `4.3.0`、React `18.3.1`、Webpack `5.91` 系列 | 主流程报告微信产物与 H5 构建通过。Webpack 完整补丁号以项目清单/锁文件为准，本文件未读到精确 patch，不补写。 |
| 小程序构建补充依赖 | `@babel/preset-react` `7.28.5`、`react-refresh` `0.14.2` | 主流程为修复实际构建缺失显式加入；本次未读到 Taro 官方模板对应清单，不声称这是官方模板已声明的依赖组合。 |
| 管理后台 | 官方 Ant Design Pro `v6.0.3`，提交 `adfd44085738ca953573a13322c1ba84aca8b9e3` | 主流程已导入并构建通过；官方 release 关联短提交 `adfd440`，完整 SHA 来自主流程导入记录。 |
| 后台框架依赖 | React / React DOM `19.2.7`、antd `6.6.0`、Umi Max `4.7.3`、TypeScript `7.0.2` | 主流程已安装与构建通过；官方 tag 清单列出的依赖范围下界相同，实际固定值由项目锁文件保证。 |

小程序与后台分别使用 React 18、React 19；不得为了统一版本强制覆盖所有工作区的 React。API 的 TypeScript 5.9.3 与后台模板的 TypeScript 7.0.2 也按工作区分别解析。

## 已读取的第一方来源

### Taro 4.3.0 与 React

- [Taro 官方 v4.3.0 release](https://github.com/NervJS/taro/releases/tag/v4.3.0)：确有稳定版本 `4.3.0`；本次页面将其列为 Latest。该标签证明版本已发布，不证明本项目微信真机效果。
- [官方 v4.3.0 的 `@tarojs/react` 清单](https://raw.githubusercontent.com/NervJS/taro/v4.3.0/packages/taro-react/package.json)：版本 `4.3.0`、Node.js `>=18`、React peer 为 `^18`，内部使用 `react-reconciler 0.29.0`。因此 React `18.3.1` 符合已读适配包约束，React 19 不在该 peer 范围内。

建议将使用到的 Taro 核心、运行时、CLI 与平台/框架插件固定到同一版本 `4.3.0`。CLI、Babel、Webpack 以及插件的全部传递依赖仍以实际锁文件和构建结果为准；本文没有独立核验所有插件清单。

### NestJS 12.1.3 与 Node.js 24

- [Nest 官方 v12.1.3 release](https://github.com/nestjs/nest/releases/tag/v12.1.3)：发布页存在，日期为 2026-10-12，本次页面列为 Latest。
- [官方 tag 的 `@nestjs/core` 清单](https://raw.githubusercontent.com/nestjs/nest/v12.1.3/packages/core/package.json)：版本 `12.1.3`、Node.js `>=20`、`type: module`；`@nestjs/common` 和平台适配器 peer 均要求 12 系列，RxJS 要求 `^7.1.0`。Node.js 24 满足其声明的 Node 范围，ESM 构建与加载行为应由项目验证。
- [Node.js 官方发布表](https://nodejs.org/en/about/previous-releases)：在先前 2026-10-17 核查中，24 与 22 列为 LTS，26 列为 Current；官方建议生产使用 Active/Maintenance LTS。该记录支持选择 Node.js 24 系列，**不用于证明 `24.19.0` 是最新补丁**。
- [Nest 官方 OpenAPI 文档](https://docs.nestjs.com/openapi/introduction)：先前核查确认 Swagger 模块可生成 OpenAPI、提供 Swagger UI 与导出 JSON/YAML。本文没有独立读到 `@nestjs/swagger 12.0.2` 的 peer 清单，不能仅靠该概述页断言版本兼容；当前证据来自主流程实际安装及测试。

建议 Nest 运行与测试相关核心包保持 `12.1.3` 同步固定，不采用浮动 `latest`。

### Prisma 6.19.3 与 MySQL 8.4

- [Prisma 官方 6.19.3 release](https://github.com/prisma/orm/releases/tag/6.19.3)：发布页可读取，证明标签存在。
- [该 tag 的 Client 源码清单](https://raw.githubusercontent.com/prisma/prisma/6.19.3/packages/client/package.json)：Node.js 要求 `>=18.18`、TypeScript peer `>=5.1.0`；本次读到的源码版本字段为构建占位值 `0.0.0`，不能用它伪称 npm 成品版本字段已核实。源码声明与发布记录结合只支持兼容性判断，安装版本由主流程和锁文件确认。
- [MySQL 官方 JSON 文档](https://dev.mysql.com/doc/refman/8.4/en/json.html)、[MySQL 官方 LTS 策略](https://dev.mysql.com/doc/refman/8.4/en/mysql-releases.html)：先前读取确认 8.4 是 LTS，支持 JSON。它们不证明本机 `8.4.9` 镜像内容或 Prisma 特定 patch 的驱动结果。

Node.js 24 与 API 的 TypeScript 5.9.3 满足上述 Client 声明的最低范围。Prisma 与 MySQL 8.4.9 在本项目的有效证据是主流程回传的真实迁移和集成测试。建议 CLI 与 Client 同步固定 `6.19.3`，生成产物与数据库迁移在每次升级时重新验证。

### Ant Design Pro 官方固定模板

- [官方 release 列表](https://github.com/ant-design/ant-design-pro/releases)：本次最新稳定 release 为 `v6.0.3`，关联提交短号 `adfd440`，最低 Node.js 提升至 22。
- [官方 v6.0.3 清单](https://raw.githubusercontent.com/ant-design/ant-design-pro/v6.0.3/package.json)：`react` / `react-dom` 为 `^19.2.7`、`antd` 为 `^6.6.0`、`@umijs/max` 为 `^4.7.3`、TypeScript 为 `^7.0.2`、Node.js 为 `>=22.0.0`。Node.js 24 满足模板所声明的范围。
- 清单中 `@ant-design/pro-components` 为 `^3.1.14-2`，含预发布标识；不能把整个依赖树概括为全部正式稳定包。应保留模板来源，记录实际解析版本并运行组件回归，不自行无依据地更换后台设计系统。
- [已导入的固定提交](https://github.com/ant-design/ant-design-pro/commit/adfd44085738ca953573a13322c1ba84aca8b9e3)：完整 SHA 由主流程提供；本研究访问官方 release 已确认短号，但没有独立通过 Git ref/API 解析完整 SHA。

保留模板既定设计，不跟踪浮动 `master`。上游清单使用 `^` 范围，不能代替项目自己的锁文件。主流程报告通过 `esbuildMinifyIIFE: true` 解决构建问题；这是本项目实际修复记录，本文件未查到并引用官方要求该选项的文档。

## 当前验证结论与剩余边界

1. **可保留的版本组合：** Node.js 24 系列；小程序 Taro 4.3.0 + React 18.3.1；API Nest 12.1.3 + Swagger 12.0.2 + Prisma 6.19.3；后台官方 Pro v6.0.3 + React 19.2.7 + antd 6.6.0 + Umi 4.7.3。精确运行时、包管理器与依赖以本地已固定版本为准。
2. **已回传的执行结果：** 微信/H5 与后台构建通过；真实 MySQL 迁移和 15 项集成测试通过；浏览器 3 项测试通过。尺寸测试尚在增加，本文件不预判结果。
3. **未独立完成的官方元数据核验：** npm 官方注册表的 web 访问失败；命令行默认网络解析失败；后续升级权限读取被中断。因此没有取得 npm tarball 的完整 peer/engine/完整性元数据，不将失败查询算作验证成功。
4. **本文未证明的内容：** 全部传递依赖安全性、微信上传/登录/域名/外链能力、真实微信 Android/iOS 布局和性能，以及线上审核通过。H5/浏览器测试不能替代微信真机验收。

除上文明确标为 2026-10-17 的既有来源外，官方 release 与 tag 清单均在 2026-10-18 本次读取。本文未修改业务文件、安装依赖或提交版本。
