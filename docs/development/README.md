# 开发运行与执行基线

**继续开发状态（2026-10-18）：**用户已要求继续，当前M7采集/聚合/Pro报表和M8本地补测已接入。新增迁移`202610180006_analytics`，按下述原命令执行`db:generate`、`db:migrate`；后台新增`/analytics`，API新增`POST /events`与`GET /admin/analytics`，共53个operation。完整状态与测试证据见[本轮报告](project-status-20261018.md)。下方各阶段数量与暂停描述均为历史记录。

全量检查使用`pnpm quality --phase=m8`。新增恢复测试会短暂停止并重启**本项目**MySQL容器、验证`career_test`数据、在隔离临时库内备份恢复/从旧迁移升级，再清理本次临时库；不删除开发库或数据卷。运行时先停止本项目的其他测试/预览，避免并发占用。备份只在内存处理，不输出SQL或密码。性能步骤记录本机单并发基线，不给出生产SLA。

行为原始数据90天、请求14天、日聚合365天，启动及每小时执行；服务停机期间不会继续清理。日聚合含内部去重集合，仅用于本地统计，不从API返回访客/flow标识。选择正式环境应为0；要查看本机业务请在报表显式选择local。没有公网发布或微信真机验收。

Windows干净克隆复验补记：沿用的受保护`.gitattributes`会将TS/JSON等检出成CRLF，与固定Biome的LF规则冲突。`bootstrap.mjs`现在只对Git跟踪的正式工程UTF-8源码转换CRLF→LF，不还原HEAD、不替换本地编辑、不重建已删除文件；跳过原型基线、整个固定Pro模板（含生成客户端）、历史文档/证据、未跟踪私有文件、二进制与符号链接。原型保护规则与Git全局配置保持原样。质量流程在指纹计算前执行该初始化，并新增3项初始化回归；当前完整流程为19项命令。安装步骤仍使用原冻结锁文件。

**M5/M6追加（本地门禁已执行，保留延期）：**当前新增任务计划、服务端四题测验、分级课程、原生播放器与我的学习恢复，共51个REST operation。首页按原型A接业务；工程状态页改到`/#/pages/engineering/index`，原型文件不改。新增迁移0004/0005后按同样步骤`db:generate`、`db:migrate`启动。播放秒数/看过按本人同课共享，各任务最近课程、测验和等级独立；见[实现约束](m5-implementation.md)、[审查及最终测试状态](m5-review.md)。下文M2–M4数量/未实现说明为历史阶段记录；M7分析与M8全系统验收继续推进。没有自动开放公网或微信上传。

当前已完成M2工程基线，M3内容管理/目录及M4本地岗位输入/分析已接入，按`miniapp_plan.md`、`phase-one-decisions.md`及产品/测试手册执行。用户已于2026-10-18授权开发。原型11文件保留，4个展示文件存在用户批准的颜色值例外；[当前配色与保护说明](../design-color-update.md)。正式工程位于`apps/`。工程验证入口不是产品首页，当前不是完整业务系统交付。M4详情与真实结果见[M4审查](m4-review.md)。

**独立启动修复补记：**展示时发现API直接使用Express却没有声明直接依赖，现补齐已安装的精确版本5.2.1并增加ENG-008子进程运行回归。原因、首次失败及后续完整复验见[运行修复审查](runtime-preview-review.md)，历史M4报告不回写。

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
pnpm media:generate
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

- 当前实现39个operation：4个基础、6个公开目录/课程/受控媒体、17个本地内容管理、7个岗位/分析、5个私有截图/OCR。后台入口`/content/scenes`、`/content/courses`、`/content/questions`、`/content/releases`；小程序工程入口可进入目录和岗位输入。计划、测验、进度及运营行为分析尚未开放，建表不等于实现。
- 17场景、36任务、168知识点从受保护原型只读提取，模拟题库`mock-question-set-v1`每场景4题（第1/4题通用，第2/3题场景）。种子只创建缺项，不覆盖运营修改，不生成访客成绩/学习记录。`media:generate`制作并核验本项目自制3秒纯色测试片；seed在该媒体存在时创建51门显式测试课，覆盖17场景三级目录。它们不是教学课程。
- 媒体文件和探测清单位于忽略的`infra/runtime/media`；不提交视频或私人上传。受控媒体通过实际文件哈希、体积、ffprobe时长校验；来源HTTPS网页与媒体分离，网页不能充当播放器地址。发布须满足授权、章节总和、有效关联以及`0<实际秒数<=2100`，草稿允许未配置时长/媒体；发布后的编辑同样校验。已发布题库禁止改题，只能建新版本。
- 管理编辑使用version/revision乐观锁；旧版本409，发布/下架及创建使用持久幂等键。审计与内容变更同事务，创建结果Location可重读，操作审计不伪造已认证管理员身份、不包含JD或凭据。目录支持稳定分页/中文任务词/英文ID/分类交集，错误和真空结果分别显示。
- 小程序目录与任务页复用原型当前白底蓝橙黄色Token和原始SVG路径生成的PNG图标；`scripts/generate-icons.mjs`可用本机Edge重新渲染素材。保留原型横滑分类与单选任务。当前仅选择任务，尚不宣称已保存学习计划；测验、课程业务页与A首页随M4/M5接入。
- `career_local`用于开发；`career_test`专供自动化，不复制真实用户数据。首次建卷时初始化SQL创建测试库；当前机器已用同样SQL初始化。测试迁移仅对测试库执行，测试不清空开发库。

### 岗位模块本地演练

工程入口点“解析我的岗位”，或进入H5 `/#/pages/jd/index`。文字模式空白禁用、岗位名选填≤100字、正文≤8000字；另一个模式草稿独立。示例覆盖需确认，确认后创建不可变输入并分析。模拟截图会标识为本地模拟；普通实际截图显示空核对稿，需手工补录并确认。方向多选后进入明确的首个目标选择任务，可“返回本次分析”继续其他候选；不自动建立首任务或成绩。

`local-rules`分析保存于数据库，可恢复queued/running/失败/取消/成功；轮询不显示虚构完成步骤。原文/图片/Token不写通用日志；分析成功事件和业务终态同事务，只记真实成功。图片私有存于忽略的`infra/runtime/private-images`，24小时后拒读；服务启动补清、运行中每60秒清理最多100项，停机时不承诺物理删除。部署前需要持续清理任务和监控。示例PNG及白名单哈希随代码提交，新克隆无需再生成图片；`scripts/generate-ocr-fixture.mjs`仅用于明确更新样例时，不能把任意图片加入白名单冒充真实OCR。

数据库新增迁移`202610180003_jobs_leases`，正式升级已有业务库前需先审计旧OCR重复记录及旧图片哈希，不能因本地空表迁移通过就直接发布。
- 匿名凭据由服务端生成32字节随机值，库中只保留SHA256摘要。客户端统一请求入口保存凭据；无登录、微信身份交换、平台绑定和虚拟管理员。清存储/换设备不承诺恢复。
- 本地API只接受回环监听配置，Host校验防止外部域名访问；管理API还要求`X-Admin-Local: 1`及允许的Origin。生产/公网模式启动即拒绝，D08之前不变通开放。
- 微信产物在`apps/miniapp/dist/`；H5产物在`dist-h5/`。本地HTTP地址只供模拟，尚不能作为微信网络/域名/选图/video真机验收；没有运行微信开发者工具、上传或发布。
- JD计数口径：Unicode code point，`Array.from(text).length <= 8000`；证据区间为JavaScript UTF-16下标，客户端使用原确认文本`slice(start,end)`定位。岗位标题后续API按手册冻结；当前不增加岗位接口。

## 一致性、契约和测试

统一生成命令`pnpm contracts:generate`从Nest控制器生成OpenAPI、类型及客户端，结果位于`packages/contracts/`。两端通过生成客户端和薄传输适配层请求，不另抄响应DTO。接口变更同时更新实现、契约、客户端及对应测试；`pnpm contracts:check`只检查不覆盖。所有错误响应固定`code/message/details/requestId`；requestId允许1–64个字母、数字、下划线、连字符，无效时生成UUID。

执行`pnpm quality --phase=m3`，顺序运行冻结安装、原型保护、Biome、类型、Pro及Ant Design组件检查、规则/真实MySQL接口测试、契约无漂移、三端构建和Playwright。任何失败即停止并保留该批次证据。结果保存`docs/development/evidence/m3-*/results.json`及各步骤文本，包含基准提交、代码指纹、lockfile/fixture哈希和真实退出码；截图也保存至对应批次，M2历史证据不覆盖。独立运行浏览器用例的截图在忽略的`infra/runtime/browser-evidence`。`pnpm test:e2e`使用本机已有Edge无界面运行，不下载浏览器、不连接个人档案；未安装时报告缺口。测试进程只启动并停止本项目服务。

当前M4使用`pnpm quality --phase=m4`，同一门禁覆盖全部已实现模块，证据保存在`m4-*`目录；最新最终批次为`m4-20261018T024725411Z`，114通过、1既有长媒体边界延期，详见[M4审查](m4-review.md)。阶段名不会跳过旧模块回归，也不表示尚未实现的M5–M8已经完成。

M3-017需要2099/2100/2100.1/2101秒自制边界视频；本会话的生成命令未获执行许可，因此测试明确skip，报告`deferredTests`记录原因。门禁即使其他检查通过也只能记`passed-with-deferred-tests`，不得称完整M3验收通过或35分钟实播边界已验证。生成器已有`--boundaries`选项，但本轮不绕过该执行限制。3秒媒体发布/Range、无效时长拒绝和M2时长规则单测分别有独立证据。

规则单测覆盖不等于整项MT验收通过。功能必须逐项走接口和页面，业务尚未开发的项保留未执行。M2历史截图只是工程验证页及Pro基线，后续商业首页须遵循A结构和D01-COLOR-20261018配色；不将工程验证页冒充商业设计。

## 已知上游提示

固定官方Pro/Umi依赖树包含旧插件的peer范围提示；当前产品没有启用dva等旧演示插件。已验证实际产品路由的类型和构建；不通过强制升级依赖或隐藏提示冒称全树零告警。Ant Design专用检查在上游演示代码报告14项静态反馈API提示，当前产品入口未使用这些文件。原样保留演示源码作模板来源，未放入产品路由。

固定官方模板的ProComponents为`3.1.14-2`，包含预发布标识；这是官方稳定模板自身的依赖，已记录并对实际使用组件做回归，不能将整个依赖树称为全正式稳定版。

H5入口约300KiB触发Webpack默认244KiB建议阈值，后台有Browserslist资料更新提示。均保留在日志，不改高阈值掩盖；容量/性能目标尚未确定，后续以业务产物测量。Windows下使用Umi官方Webpack路径，并按其构建器诊断开启`esbuildMinifyIIFE`，没有更换后台模板或设计体系。
