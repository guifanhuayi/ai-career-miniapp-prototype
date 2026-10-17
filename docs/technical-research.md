# 微信小程序实现技术可行性核查

核查日期：2026-10-17（Asia/Shanghai）。本文件仅提供事实、限制和待选建议，不代表用户批准技术选型、供应商、版本或产品范围变更。研究阶段未安装依赖、调用付费服务、上传小程序或提交 Git；规划材料由主任务统一本地提交。检查了仓库及上级路径，未发现适用的 `AGENTS.md`。

研究完成后用户补充确认：本产品是独立微信小程序，需要关联现有百年前程平台账号。因此后续身份方案必须核对现有账号协议，不再将是否独立作为未决问题；技术选型与关联协议仍未确定。

**2026-10-18范围更新：**首期不做登录/账号关联，用户已委托工程确定技术、视频与分析方案；现采用Taro、NestJS、MySQL及原生受控媒体播放。本文保留2026-10-17研究事实和候选对比，当前决定以[首期开发决定](phase-one-decisions.md)和主计划为准；登录关联不再是首期阻塞。

## 结论

本地可建设可重复启动的 API、数据库、Ant Design Pro 后台和小程序工程，也可通过模拟适配器覆盖微信登录、OCR、模型及外链异常。浏览器模拟通过不能证明真实微信环境通过。原型的“点击任意 B 站链接直接播放”是当前首要可行性风险：浏览器跳转行为不能直接搬入小程序；业务域名权限、账号主体、课程来源和真实播放方式需要先完成验证。

## 技术候选与决策依据

| 项目 | 本次核实的事实 | 对本系统的建议（待用户决定） |
| --- | --- | --- |
| 原生小程序 + TypeScript | 微信官方提供 `miniprogram-api-typings`；类型声明随 API 文档自动生成。[微信官方类型仓库](https://github.com/wechat-miniprogram/api-typings) | 若只面向微信，原生方案可减少框架适配层。业务规则做成纯 TS 模块，微信 API 单独封装，便于离线测试；需自行安排 WXML/WXSS 测试与浏览器预览方案。 |
| Taro + TypeScript | Taro 官方支持 React/Vue 开发多端应用；CLI 可分别构建微信和 H5 产物。[官方仓库](https://github.com/NervJS/taro)、[构建文档](https://docs.taro.zone/docs/GETTING-STARTED/) | 若重视与 React 后台共享开发习惯、H5 场景模拟，可优先评估。先以登录、选图、上传、外链、测验和长列表做小规模验证，再决定；H5 与微信渲染差异仍需验收。 |
| NestJS REST + OpenAPI | `@nestjs/swagger` 能从代码装饰器生成 OpenAPI 文档并提供 Swagger UI，也能导出 JSON/YAML。[官方文档](https://docs.nestjs.com/openapi/introduction) | 作为候选后端：围绕 JD 分析、测验尝试、推荐、课程、学习记录、事件等资源设计 REST API；契约须含鉴权、分页、错误、异步状态和示例。文档生成本身不保证接口符合 REST。 |
| Ant Design Pro | 官方将其定位为企业应用 React 模板，包含布局、表格、表单、分析和登录等页面。[官方仓库](https://github.com/ant-design/ant-design-pro) | 遵守用户已固定的后台模板要求；以其默认组件、布局和设计规范建设后台，业务页面包括课程/题库/场景配置、审核发布、用户行为分析。发布版本与模板提交在用户确认后固定，不直接追踪浮动 `master`。 |
| MySQL | 原生 JSON 类型可验证 JSON 格式；JSON 列不能直接建立普通索引，可对抽出的生成列建立索引，也支持特定 JSON 数组的多值索引。[MySQL 8.4 官方参考](https://dev.mysql.com/doc/refman/8.4/en/json.html) | 优先评估单一关系数据库：课程、任务、题库、用户、作答、推荐批次用关系表；JD 分析证据、模型输出快照、埋点扩展字段按需用 JSON。经常筛选、关联和聚合的字段应明确列与索引。无需因为有 JSON 就另加 MongoDB。 |
| Redis | Redis 官方列出了缓存、会话、限流和队列等用途。[官方用例](https://redis.io/docs/latest/develop/use-cases/) | 初期先证明需求；出现多实例共享限流/会话、高成本查询缓存或可靠后台任务需求时再引入。推荐点击量本身不足以证明必须使用 Redis。 |

以上比较中的“减少适配层”“优先评估”“何时引入”是架构判断，不能视作官方性能结论。具体 Node.js、框架、ORM、组件库版本尚未锁定；实施前应验证所选稳定版本的相互兼容性，记录版本、锁文件、升级流程和回归用例。

### 版本策略补充

- **Node.js：** 2026-10-17 读取的官方发布表显示 v24 与 v22 为 LTS，v26 仍为 Current；官方建议生产应用只使用 Active LTS 或 Maintenance LTS。因此建议先评估 Node.js 24 LTS 的维护补丁版本，确认 Taro、Ant Design Pro、NestJS 和构建依赖共同兼容后再固定；不因 v26 数字更新而直接采用。[Node.js 官方发布表](https://nodejs.org/en/about/previous-releases)
- **MySQL：** 官方区分 LTS 与 Innovation；LTS 注重稳定功能和较长支持周期，文档已明确列出 8.4 LTS 至 9.7 LTS 的升级路径。因此 8.4 LTS 和 9.7 LTS 均可列入评估，结合数据库驱动、ORM、部署环境及备份恢复验证选择，不把 8.4 称为最新 LTS。初始化时再核查实际可下载的受支持补丁版本。[MySQL 官方版本策略](https://dev.mysql.com/doc/refman/8.4/en/mysql-releases.html)、[9.7 官方发行说明](https://dev.mysql.com/doc/relnotes/mysql/9.7/en/)
- **模板与依赖：** Ant Design Pro 固定模板 tag/commit、包管理器版本和 lockfile；跨主版本升级作为独立变更经过回归与审查。上述均为待确认的实施策略，本次未修改环境或选择镜像标签。

## 不使用微信开发者工具的边界

1. **编写与构建可走命令行。** Taro 官方明确提供 `taro build --type weapp` 与 H5 构建；其 CI 插件另有 `preview`、`upload` 命令，微信配置包括 AppID 与上传私钥路径。[构建文档](https://docs.taro.zone/docs/GETTING-STARTED/)、[Taro CI 文档](https://docs.taro.zone/docs/plugin-mini-ci)
2. **不能把开发者工具 CLI 当作无开发者工具方案。** 用户禁止使用微信开发者工具，计划应排除依赖其安装、启动或自动化端口的方案。Taro 的 `--open` 明确用于打开开发者工具，不应采用。[Taro CI 文档](https://docs.taro.zone/docs/plugin-mini-ci)
3. **微信官方 `miniprogram-ci` 的详细安装、权限、网络、上传和预览条件本次未完成一手核验。** [官方 CI 页面](https://developers.weixin.qq.com/miniprogram/dev/devtools/ci.html) 在本次浏览中返回不可访问错误。Taro 官方文档证实其自身提供 CLI 入口，但不能替代微信规则核验，也尚未证明本机上传可用。
4. **本地测试与真机验收分开记录。** 纯 TS 规则、API、数据库事务、后台及 H5 流程可自动化；真实微信登录、选图授权、基础库/机型布局、网络域名、web-view 和外部播放器应保留真机测试。当前没有 AppID、上传凭据和真机运行结果，不能宣称已通过。Nest 官方支持测试模块、单元与端到端测试。[Nest 测试文档](https://docs.nestjs.com/fundamentals/testing)

建议将交付分为“本地系统可运行”“微信代码包可构建”“体验版真机通过”“线上审核发布”四种状态；前一种不能自动替代后一种。没有远程服务器时可先完成本地系统；真机访问本地服务还需设备可达且满足微信网络限制的受控联调环境，方案要验证后再确定。

## 外部课程链接与学习记录

### 已核验与未核验的事实

- 微信官方 API 类型声明中，`NavigateToOption.url` 描述的是代码包内页面路径。因此不能把 `wx.navigateTo({ url: 'https://www.bilibili.com/...' })` 当作浏览器任意外链导航。[微信官方 API 声明源码](https://raw.githubusercontent.com/wechat-miniprogram/api-typings/master/types/wx/lib.wx.api.d.ts)
- Taro 官方 WebView 文档注明：承载网页、铺满页面；其他网页需在小程序后台配置业务域名；网页消息在后退、销毁、分享等特定时机接收。文档亦提示个人与海外类型暂不支持。以上是 **Taro 自有组件文档的已读内容**，不是本次直接核验后的微信平台规则。[Taro WebView 文档](https://docs.taro.zone/docs/components/open/web-view/)、[对应官方源码](https://raw.githubusercontent.com/NervJS/taro/main/packages/taro-components/types/WebView.d.ts)
- [微信官方 web-view 页面](https://developers.weixin.qq.com/miniprogram/dev/component/web-view.html) 本次不可访问；业务域名验证文件、跳转/嵌套域名、账号主体权限等具体规则须在正式接入前重新查看官方页面与账号管理后台。**尚未验证本项目主体是否能够配置 B 站业务域名，也未得到 B 站合作能力或有效跳转路径，故不能承诺 B 站网页可在本小程序直接打开。**
- 本次没有获得 B 站官方授予本系统的视频进度 API、SDK 或播放器回调。根据已读 WebView 事件接口，不能由网页加载成功或课程按钮点击推导出“已观看/已完成”。这是接口边界判断，不是对所有第三方合作方案的否定。[Taro WebView 接口](https://docs.taro.zone/docs/components/open/web-view/)
- Taro 自有 Video 组件接口包含播放、结束、进度事件；它针对受控播放器及可用视频资源，与第三方网页不是同一接口。[官方 Video 类型源码](https://raw.githubusercontent.com/NervJS/taro/main/packages/taro-components/types/Video.d.ts)

### 应由用户选择的可行方向

| 方向 | 前置验证 | 可提供的学习记录 |
| --- | --- | --- |
| 保留第三方课程导航 | 获得真实可用且平台允许的网页/目标小程序接入路径、配置权限并做真机测试 | 浏览详情、尝试打开、可观测的打开结果；完成状态须由用户声明或第三方可靠回传 |
| 使用有授权的自有/合作视频资源 | 内容授权、可播放资源、存储/带宽及域名、播放器方案 | 播放进度、续播、完成事件；仍需考虑拖动进度和客户端上报可信度 |
| 合作平台小程序跳转 | 目标 AppID、实际页面路径及目标方支持；不是将网页 URL 填入小程序页面路径 | 跳转行为；跨平台观看进度仍依赖合作回传 |

这些是讨论选项，不是范围变更。不能擅自把直接播放改成复制链接、加中转确认页或采购视频服务。最先应对真实样例课程做端到端验证；验证失败应由用户决定产品取舍。

## 登录、AppID 与域名上线条件

微信官方 API 源码确认 `wx.login` 获取临时 code，再换取登录态，涉及 openid、条件满足时的 unionid 与 session_key。[官方 API 源码](https://raw.githubusercontent.com/wechat-miniprogram/api-typings/master/types/wx/lib.wx.api.d.ts)

建议业务 API 只接受 code，由后端适配微信登录并签发自身会话；微信密钥不得进入小程序代码包。本地模拟登录只能用明确标识的开发身份，不能声称已绑定真实微信用户。

以下为 **上线前待官方重新核验与实际账号确认的条件清单**，不是本次已核实的完整平台规则：

- 确定小程序主体、AppID、管理员/开发者/体验者权限和对应业务类目；确认现有百年前程平台账号如何与小程序身份关联。
- 验证后端 code 换取登录态的参数、密钥管理、错误码与过期处理。[微信登录指南（本次不可访问）](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/login.html)、[code2Session（本次不可访问）](https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-login/code2Session.html)
- 核对 API 请求、图片上传、下载资源、视频与 web-view 分别所需域名；确认 HTTPS/证书和备案等适用条件，不能将业务域名与请求域名混为一谈。[微信网络说明（本次不可访问）](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)
- 核对隐私声明、选图/OCR 数据处理范围、备案、审核和发布步骤；外部平台注册和授权等不能由代码模拟替代。涉及法规结论需要另行查阅适用官方规则，本研究未给出法律合规判断。

## 建议进入自动化测试与分析口径的场景

以下为本系统的设计建议，尚未实现。每个大模块完成后新增/更新测试用例与结果，再进行代码审查；不能仅凭编译通过作为业务验收。

| 领域 | 最小可复核场景 |
| --- | --- |
| JD/OCR | 空文本、超长文本、重复提交、上传类型/大小错误、识别超时、人工修正、证据与结论不匹配 |
| 测验与推荐 | 题库版本固定、重试不重复计分、等级边界、无匹配课程、课程下架、同输入同规则版本可复现 |
| REST/OpenAPI | 参数验证、未登录/无权限、分页、状态码、错误结构、幂等重试；实际响应与文档契约一致 |
| 外链 | 不支持的域名、加载失败、课程失效、目标不可达、用户返回、无进度回传时不增加完成数 |
| 埋点 | 请求开始/成功/失败与耗时、traceId；业务事件单独定义；重试去重、离线补报、乱序；禁止把 code/token、完整 JD 和截图正文写入通用日志 |
| 后台分析 | 验证匿名/登录用户口径、曝光至详情至打开漏斗、测验完成率、重复事件不重复计数；“点击打开”与“学习完成”分开 |
| 数据与本地启动 | 空库迁移、种子数据、重启保留数据、备份恢复、课程版本发布回滚；禁用真实模型/微信服务时明确模拟状态 |

建议 API 请求统一记录可观测性字段；业务事件通过独立事件资源批量上报，主流程故障与分析上报故障分别处理。业务口径与字段保存期限需由用户确认；埋点不能替代可靠业务表。

## 阻碍与下一步核验

1. 先确认外链播放的真实可行路径与数据可见范围，否则课程详情、学习记录及后台完成率都存在错误预期。
2. 微信小程序目标已明确；确认是否接受 H5 作为场景模拟和视觉回归载体，再选择原生 TS 或 Taro。
3. 在真实账号、官方资料可访问后验证无开发者工具的预览上传链路；保留 AppID、业务域名、服务器网络和真机验收为独立关卡。
4. OCR/模型供应商、预算、真实课程、题库评估依据及平台账号集成方式尚未确定。本文件不替用户选定。

引用均为本次 2026-10-17 读取的第一方文档/源码；Taro 文档只能证明其框架声明，不替代微信管理后台和微信最新平台规则。MySQL 引用 8.4 手册用于说明能力，未决定本项目版本。微信页面访问失败已逐项标明，未将搜索摘要、第三方转载或镜像当作官方验证成功。
