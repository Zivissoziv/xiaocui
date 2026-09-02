# ADR-005: 后端采用 NestJS（从 Express 迁移）

## 状态

已采纳

## 背景

后端最初是 Spring Boot + MyBatis（Java）版，后移植为 TypeScript 版本地实现（Express 4 + 手写分层 + `node:sqlite`），接口契约与 Java 版 1:1 对齐。TS 版当时刻意不套框架：移植目标是契约不变，且 25 个路由的体量用框架收益不大。

项目后续计划持续扩展（多模块、鉴权、多租户、可测试性等），单体 Express 手写分层的扩展成本开始显现：

- 依赖注入缺失，service 直接 import repository，单测难以替换依赖。
- 参数校验靠手写 `isBlank()`，无 DTO/校验层。
- 无模块化边界，新增功能时目录规范靠约定维持。

## 决策

将后端从 Express 手写分层迁移到 **NestJS 12**（Express 5 内核），业务逻辑零改动，只改结构：

- 8 个可注入 provider：Database、Repository、Settings、AddressBook、Contact、AiRouting、Followup、Session（对应原 db/repository/settings/addressBook/contact/aiRouting/followupService/sessionService 模块）。
- 4 个控制器覆盖 25 条路由；`/api/followup-items/:itemId` 保持带 `/api` 前缀的原始契约（Java 版类级 `@RequestMapping("/api")` + 方法级 `/followup-items/{itemId}`）。

> **2026-09-02 修正记录**：Express 版早期移植时误把 `followup-items` 的 `/api` 前缀丢掉（其余路由均带前缀），NestJS 迁移照搬了该错误，契约快照又按错误路径录制（47 项全绿掩盖回归）。前端 `followupApi.ts` 始终请求 `/api/followup-items/{id}`，导致新建向导「确认创建」与详情页编辑/删除人员全部 404。已改回 `@Controller('api/followup-items')` 并同步回录快照探针路径。教训：契约快照的探针路径必须来自 Java 版原始契约，而非上一版 TS 实现。
- 全局异常过滤器，保持 `400 + {message}` 错误格式契约。
- 纯函数模块（draftBuilder / tableProfile / ruleBased / sender / workbook / openai）保持普通模块——DI 服务于可替换的副作用，纯函数不需要。
- 数据层保留 `node:sqlite` + 手写 SQL（Prisma/TypeORM 不支持内置 sqlite；将来换 PostgreSQL 只动 Repository 一层）。
- 依赖精简：顶层 `express@5` 与 Nest 内置版本统一，移除多余的直接 `multer`（上传由 FileInterceptor 提供）。

## 迁移方法（契约快照驱动）

为保证 25 个路由行为完全一致、前端零改动，采用「契约快照」流程：

1. 迁移前录制基线快照：47 个探针遍历全部路由，记录状态码、Content-Type、Content-Disposition、响应体（`scripts/contract-snapshot.js`）。
2. 同代码跑两轮自校验，确认快照可重复（发现并规避了 AI 输出非确定性问题——快照期间禁用 AI，走规则版确定性路径）。
3. 机械转换 + 编译器 + 契约比对三重验证：函数体逐字符保留，由脚本改造成类方法，`tsc` 兜底类型，最终 `contract-compare.js` 逐条比对。
4. 验收标准：Express 基线 vs NestJS 快照 **47 探针 0 差异**；NestJS 两轮自校验 47/47 一致；前端 6 个关键接口 + 页面全通。

## 影响

好处：

- 依赖注入、模块化边界、DTO/校验管道（后续可加 zod/class-validator）就位，扩展和单测成本显著降低。
- NestJS 生态（守卫/拦截器/中间件/定时任务）为后续鉴权、多租户、异步任务铺路。
- 契约由快照脚本持续守护，后续重构可随时回归。

代价：

- 框架带来约 30 个传递依赖、装饰器编译开销（`experimentalDecorators` / `emitDecoratorMetadata`）。
- 迁移期新旧入口并存过一段；`scripts/to-provider.js` 转换脚本属一次性工具，保留备用。
- 已知遗留：`xlsx@0.18.5` 有高危漏洞且 npm 无修复版（SheetJS 已下架 npm，修复版在官方 CDN），换源需评估，暂不阻塞。
