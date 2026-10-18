# 百年前程 · AI 成长课

面向大学生实习与求职的任务导向学习小程序：从岗位要求或具体任务出发，通过能力测验找到合适的学习路径和课程。

本仓库同时保留**最初的交互原型**和**正在开发的正式工程**。正式工程包含微信小程序、REST API、MySQL 和 Ant Design Pro 管理后台，目前可在本地模拟运行，尚未上线。

> **当前状态 · 2026-10-18：已按用户要求暂停后续功能开发，保存并推送现有成果。**
> M2–M6 已实现本地业务闭环；M7 行为分析只有规则初稿，M8 全系统验收尚未完成。原型在线可看，不代表正式系统已部署。

## 先看哪里

| 你的目的 | 入口 |
| --- | --- |
| 快速了解页面和交互 | [在线原型总览](https://guifanhuayi.github.io/ai-career-miniapp-prototype/) · [单页交互](https://guifanhuayi.github.io/ai-career-miniapp-prototype/prototype.html) |
| 阅读产品范围、功能与约束 | [产品开发说明手册](小程序产品开发说明手册.md) |
| 查看计划和技术可行性 | [开发计划](miniapp_plan.md) · [技术可行性研究](docs/technical-research.md) |
| 在本机运行正式工程 | [启动步骤](#本地运行) · [详细运行手册](docs/development/README.md) |
| 核对测试及待办事项 | [必须要过的测试](必须要过的测试.md) · [M5/M6 审查与证据](docs/development/m5-review.md) |

## 产品流程与开发进度

```text
岗位 JD 文本 / 截图核对 → 能力需求分析 ─┐
                                      ├→ 场景与任务 → 四题测验 → 分级课程 → 视频学习
直接选择场景与任务 ────────────────────┘                                    ↓
                                                                   我的学习 / 继续任务
```

- 目录包含 **17 类场景、36 个任务、168 个知识点**；同一场景可保留多个任务。
- 服务端评分并保存测验快照；支持草稿恢复、结果回顾和自主切换学习等级。
- 单门课程实际总时长须 **大于 0 且不超过 35 分钟**，不再沿用原型的短视频/系统课筛选。
- 同一访客的同门课程共享播放位置和“看过”标记；不同任务的测验、等级、最近课程分别保存。
- 首页采用已选的 **A 引导式布局**，当前配色为**白底、蓝色主操作、橙黄色强调**；后台固定使用官方 Ant Design Pro。

| 阶段 | 当前成果 | 状态 |
| --- | --- | --- |
| M2 工程基线 | 固定依赖、匿名访客、MySQL、Swagger、质量检查 | 已实现并本地验证 |
| M3 内容与目录 | 场景/课程/模拟题库管理、发布校验、版本控制、审计 | 已实现，实播时长边界仍有 1 项延期测试 |
| M4 岗位分析 | 文本输入、私有截图、文字核对、本地规则分析、任务恢复 | 已实现并本地验证 |
| M5/M6 学习闭环 | 任务计划、服务端测验、分级课程、播放器、我的学习 | 已实现并本地验证 |
| M7 行为分析 | 事件规则、漏斗/留存等统计纯函数及规则测试 | **初稿，未接入采集、API 或后台报表，已暂停** |
| M8 全系统验收 | 全量功能点验、异常与长内容视觉检查、完整恢复验证 | **未完成** |
| D08 微信与部署 | AppID、域名、真实微信环境及部署方案 | **待决定与条件落实** |

正式工程当前提供 **51 个 REST API operation**，接口、OpenAPI 和类型客户端同源生成。现有请求观测及服务端成功事件记录，不等于完整行为分析已完成。

### 当前模拟边界

- 本期先不做登录，使用匿名访客凭据；清除本地存储或换设备不承诺恢复记录。关联现有平台账号尚未接入。
- 岗位分析采用本地规则；OCR 只有明确标注的固定示例，普通截图须手工补录并核对。尚未连接真实 AI/OCR 服务。
- 题库为模拟版，正式题库后续由产品方提供；当前课程使用自制 **3 秒测试视频**，用于验证播放与数据流程，不是教学内容。
- 不包含支付、论坛或内置内容生成工具。没有云端部署、微信上传或真机验收；H5 验证不能替代微信环境验证。

## 本地运行

使用 **Node.js 24.19.0、pnpm 11.25.0**，并安装、启动 Docker Desktop。依赖按锁文件安装，不自动升级版本。以下命令在仓库根目录的 PowerShell 执行；任一步失败时先处理该步骤。

### 首次启动

```powershell
# 初始化本地排除规则和私有配置
node scripts/bootstrap.mjs
node scripts/setup-local.mjs
pnpm install --frozen-lockfile

# 启动数据库，生成客户端并应用迁移、模拟内容
docker compose --env-file infra/runtime/local.env -f infra/compose.yaml up -d --wait
pnpm db:generate
pnpm db:migrate
pnpm media:generate
pnpm db:seed

# 构建 API、小程序、H5 和管理后台
pnpm api:build
pnpm miniapp:build
pnpm h5:build
pnpm admin:build

# 同时启动本地预览服务
pnpm local:preview
```

`setup-local.mjs` 生成的 `infra/runtime/local.env` 含本地密码，保留已有配置且不打印密码。请勿提交该文件。新克隆先执行 `bootstrap.mjs`，确保私有运行文件、依赖和构建产物被排除。

### 启动后访问

| 服务 | 地址或产物 |
| --- | --- |
| 正式工程 H5 验证入口 | [127.0.0.1:10086](http://127.0.0.1:10086) |
| Ant Design Pro 管理后台 | [127.0.0.1:8000](http://127.0.0.1:8000) |
| REST API | `http://127.0.0.1:3100/api/v1` |
| Swagger 文档 | [127.0.0.1:3100/api/docs](http://127.0.0.1:3100/api/docs) |
| OpenAPI JSON | [127.0.0.1:3100/api/openapi.json](http://127.0.0.1:3100/api/openapi.json) |
| 微信小程序代码包 | `apps/miniapp/dist/` |

服务仅监听本机；当前管理入口采用本地限制，不作为公网账号权限方案。预览终端按 **Ctrl+C** 停止服务。数据库停用可执行下方命令，保留数据卷：

```powershell
docker compose --env-file infra/runtime/local.env -f infra/compose.yaml stop
```

日常启动、环境排查、模拟数据与安全边界详见[运行手册](docs/development/README.md)。开发阶段不使用微信开发者工具；当前小程序产物已编译，但尚未完成微信真机验证。

## 技术栈与目录

| 部分 | 固定技术方案 |
| --- | --- |
| 小程序 / H5 | Taro 4.3.0、React 18.3.1、TypeScript |
| API | NestJS 12.1.3、REST、Swagger / OpenAPI |
| 数据持久化 | MySQL 8.4.9、Prisma 6.19.3 |
| 管理后台 | 官方 Ant Design Pro v6.0.3，保留 ProLayout 与固定设计 |
| 验证 | Node/tsx 规则与接口测试、真实 MySQL、Playwright + 本机 Edge |

精确版本与模板来源以各 `package.json`、`pnpm-lock.yaml` 和运行手册为准。

```text
apps/
  miniapp/             微信小程序与 H5
  api/                 REST API、服务端业务
  admin/               Ant Design Pro 管理后台
packages/
  domain/              共享业务规则
  contracts/           生成的 OpenAPI、类型和客户端
  design-tokens/       统一视觉参数
infra/                 Compose、数据库迁移与种子
scripts/               初始化、构建辅助、保护检查和质量检查
tests/                 规则、接口、浏览器及原型保护测试
docs/                  产品审阅、技术说明、测试与执行证据
index.html 等根目录文件  保留的 HTML 交互原型
```

## 测试、审查与一致性

```powershell
pnpm check:prototype       # 检查原型保护及明确批准的例外
pnpm test:protection       # 原型保护回归
pnpm test:domain           # 规则与契约客户端测试
pnpm typecheck            # 共享规则、API 和小程序类型检查
pnpm contracts:check      # 检查契约与生成客户端是否漂移
pnpm test:api             # 真实 MySQL 接口测试，使用 career_test
pnpm test:e2e             # 本机 Edge 浏览器业务测试
pnpm quality --phase=m5   # 最近完成模块的完整质量检查流程
```

接口和浏览器测试需要先完成上述环境、数据库及模拟媒体准备。`career_local` 为开发库，`career_test` 为测试库；测试不清空开发库。完整流程和每次执行证据保存在 `docs/development/evidence/`，失败记录保留。

**最近一次 M5/M6 完整验证：**17 项检查命令全部成功，**131 项测试通过、1 项延期**，包括微信/H5/API/后台构建；见[最终结果](docs/development/evidence/m5-20261018T045937343Z/results.json)与[代码审查](docs/development/m5-review.md)。延期项为真实长视频的 35 分钟临界边界验证，因此没有宣称全量验收通过。

上述报告对应 M5/M6 当时的代码指纹。随后保存的 M7 初稿已通过 **48 项规则/契约测试及三端类型检查**，不代表 M7 集成完成；也不把本 README 更新前的报告冒充新版本全量验收结果。

继续开发时，接口变更同步生成契约、补充对应测试、执行审查，并在大模块完成后本地提交。固定需求、配色、模板、依赖和原型保护不得未经授权改变。

## 开发文档导航

| 文档 | 用途 |
| --- | --- |
| [产品开发说明手册](小程序产品开发说明手册.md) | 产品边界、页面、业务规则及交付要求 |
| [开发计划](miniapp_plan.md) | 阶段划分、实施顺序和验收约束 |
| [技术可行性研究](docs/technical-research.md) | 技术选型、无服务器阶段模拟与限制 |
| [阶段一决定](docs/phase-one-decisions.md) | 已确认的 D01–D09 决定 |
| [配色变更记录](docs/design-color-update.md) | 原绿色调整为白底蓝橙黄色的授权和证据 |
| [必须要过的测试](必须要过的测试.md) · [测试用例](docs/test-cases.md) | 必测功能、异常路径和回归用例 |
| [开发运行手册](docs/development/README.md) | 环境、数据库、运行与质量检查细节 |
| [M5/M6 实现约束](docs/development/m5-implementation.md) · [审查](docs/development/m5-review.md) | 学习业务实现、修正过程和真实测试结论 |
| [45 个入口覆盖表](docs/development/m5-entry-coverage.md) | 各功能入口的证据及仍待点验的项 |
| [M7 初稿与暂停状态](docs/development/m7-implementation.md) | 当前已保存内容和未接入部分 |
| [OpenAPI 文件](packages/contracts/openapi.json) | 与控制器同源生成的接口契约 |

历史文档保留原阶段记录；阅读时以最新执行补记、已确认决定和对应批次证据为准。当前暂停状态以本 README 及 M7 状态说明为准。

## 原型保留与在线展示

根目录 `index.html` / `overview.html` 为 15 个页面与状态的总览，`prototype.html` 可双击离线交互。GitHub Pages 展示这些静态原型，**不承载正式 API、数据库或后台**。原型的内存数据、示例外链及历史筛选交互不代表正式工程的业务实现。

原型基线为 `910b4ae`；批准的配色调整和本次 README 更新分别记录，其他原型内容继续受自动化保护。最初的说明完整保存在[原型 README 存档](docs/prototype-original-readme.md)，其中旧定位、外链播放和构建命令仅作历史参考。正式工程请按本文启动，不使用历史原型生成脚本代替工程构建。
