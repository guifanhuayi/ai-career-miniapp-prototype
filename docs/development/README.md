# 开发运行与执行基线

当前进入M2工程基线，按`miniapp_plan.md`、`phase-one-decisions.md`及产品/测试手册执行。用户已于2026-10-18授权开发。原型11文件保留；正式工程位于`apps/`。此时工程验证入口不是产品首页，不能作为完整业务系统交付。

## 固定环境与首次启动

Node.js **24.19.0**、pnpm **11.25.0**。MySQL **8.4.9**通过Compose运行，镜像摘要固定。后台来自官方Ant Design Pro **v6.0.3 / adfd44085738ca953573a13322c1ba84aca8b9e3**，保留许可证、默认ProLayout设计及依赖来源。实际精确依赖见各`package.json`和`pnpm-lock.yaml`；不执行依赖自动升级。

在仓库根目录的PowerShell中依次执行，任何失败都先处理，不继续报通过：

```powershell
node scripts/bootstrap.mjs
node scripts/setup-local.mjs
pnpm install --frozen-lockfile
docker compose --env-file infra/runtime/local.env -f infra/compose.yaml up -d --wait
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm api:build
pnpm miniapp:build
pnpm h5:build
pnpm admin:build
pnpm local:preview
```

开发工具链与Docker Desktop须已安装，未安装时报告环境缺口，不自动装系统组件。首次使用Docker Desktop需启动引擎。`setup-local.mjs`产生随机本地密码并保留已有文件，不打印密码；生成的`infra/runtime/local.env`不能提交。

`bootstrap.mjs`将依赖、构建、私有运行文件排除规则写入本仓库Git的`info/exclude`，不修改受保护的原型`.gitignore`。新克隆必须先运行它。pnpm脚本若发现依赖变更直接失败，须先显式冻结安装，不能执行时悄悄解析新版本。安装脚本白名单在`pnpm-workspace.yaml`；不执行模板的Husky安装、外部统计或发布动作。

本地地址：API `http://127.0.0.1:3100/api/v1`；Swagger `http://127.0.0.1:3100/api/docs`；JSON `http://127.0.0.1:3100/api/openapi.json`；Pro后台 `http://127.0.0.1:8000`；H5验证入口 `http://127.0.0.1:10086`。预览脚本以本机地址监听，8000只代理固定本机API，不是开放代理。Ctrl+C停止本次预览进程。停止数据库使用同一Compose文件的`stop`，不要用`down -v`删除数据卷。

开发API也可`pnpm api:dev`；后台开发命令为`pnpm --filter @career/admin dev`。这些命令与整套预览不要同时占用同一端口，不会自动结束其他项目的进程。

## 业务、模拟与身份边界

- 当前实现4个基础operation：服务健康、本地管理状态、自动签发匿名访客、读取本人访客。其余业务资源即使已有表结构，也不代表功能已经实现。
- 17场景、36任务、168知识点从受保护原型只读提取，模拟题库`mock-question-set-v1`每场景4题。种子只创建缺项，不覆盖运营修改，不生成访客成绩/学习记录或虚假课程媒体。
- `career_local`用于开发；`career_test`专供自动化，不复制真实用户数据。首次建卷时初始化SQL创建测试库；当前机器已用同样SQL初始化。测试迁移仅对测试库执行，测试不清空开发库。
- 匿名凭据由服务端生成32字节随机值，库中只保留SHA256摘要。客户端统一请求入口保存凭据；无登录、微信身份交换、平台绑定和虚拟管理员。清存储/换设备不承诺恢复。
- 本地API只接受回环监听配置，Host校验防止外部域名访问；管理API还要求`X-Admin-Local: 1`及允许的Origin。生产/公网模式启动即拒绝，D08之前不变通开放。
- 微信产物在`apps/miniapp/dist/`；H5产物在`dist-h5/`。本地HTTP地址只供模拟，尚不能作为微信网络/域名/选图/video真机验收；没有运行微信开发者工具、上传或发布。
- JD计数口径：Unicode code point，`Array.from(text).length <= 8000`；证据区间为JavaScript UTF-16下标，客户端使用原确认文本`slice(start,end)`定位。岗位标题后续API按手册冻结；当前不增加岗位接口。

## 一致性、契约和测试

统一生成命令`pnpm contracts:generate`从Nest控制器生成OpenAPI、类型及客户端，结果位于`packages/contracts/`。两端通过生成客户端和薄传输适配层请求，不另抄响应DTO。接口变更同时更新实现、契约、客户端及对应测试；`pnpm contracts:check`只检查不覆盖。所有错误响应固定`code/message/details/requestId`；requestId允许1–64个字母、数字、下划线、连字符，无效时生成UUID。

执行`pnpm quality`，顺序运行冻结安装、原型保护、Biome、类型、Pro检查、规则/真实MySQL接口测试、契约无漂移、三端构建和Playwright。任何失败即停止并保留该批次证据。结果保存`docs/development/evidence/m2-*/results.json`及各步骤文本，包含基准提交、代码指纹、lockfile/fixture哈希和真实退出码。`pnpm test:e2e`使用本机已有Edge无界面运行，不下载浏览器，不连接个人浏览器档案；未安装时报告缺口。浏览器测试进程会启动并停止本项目本地测试服务。

规则单测覆盖不等于整项MT验收通过。功能必须逐项走接口和页面，业务尚未开发的项保留未执行。截图只是M2工程验证页及Pro基线，后续商业首页仍须遵循绿色A原型；不将工程验证页冒充商业设计。

## 已知上游提示

固定官方Pro/Umi依赖树包含旧插件的peer范围提示；当前产品没有启用dva等旧演示插件。已验证实际产品路由的类型和构建；不通过强制升级依赖或隐藏提示冒称全树零告警。Ant Design专用检查在上游演示代码报告14项静态反馈API提示，当前产品入口未使用这些文件。原样保留演示源码作模板来源，未放入产品路由。

固定官方模板的ProComponents为`3.1.14-2`，包含预发布标识；这是官方稳定模板自身的依赖，已记录并对实际使用组件做回归，不能将整个依赖树称为全正式稳定版。

H5入口约300KiB触发Webpack默认244KiB建议阈值，后台有Browserslist资料更新提示。均保留在日志，不改高阈值掩盖；容量/性能目标尚未确定，后续以业务产物测量。Windows下使用Umi官方Webpack路径，并按其构建器诊断开启`esbuildMinifyIIFE`，没有更换后台模板或设计体系。
