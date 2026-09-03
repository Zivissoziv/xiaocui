# 设计历史摘要（早期规划存档）

> **本文档由 5 份早期设计文档合并压缩而来**（2026-09-03 清理）：内网催办工具方案、MVP 技术设计、技术架构建议、领域模型、待确认问题。原文已从仓库删除，完整内容可经 git 历史找回。
>
> 这 5 份文档写于 **2026-08-27 ~ 08-29 的规划阶段，当时尚未编写任何代码**，属"产品设想 + 技术预研"性质。此后实现经历多次技术栈变更（Java → Express → NestJS → better-sqlite3/Drizzle，见 [ADR-005](./adr-005-backend-nestjs.md)、[ADR-006](./adr-006-better-sqlite3-drizzle.md)），文中旧技术栈与部分概念已不再反映现状。
>
> **现行实现以 README、`backend-ts/src`（尤其 `database/schema.ts`）与 ADR 文档为准；本文仅作为立项背景与设计意图的历史存档。**

---

## 1. 产品定位（源自《内网催办工具方案》）

面向"项目信息/数据收集"场景：企业内部常发 Excel 收集信息（经营数据、项目材料、审批补充等），发起人需反复查看谁没填、逐人手写催办。工具定位是**贴在 Excel 上的 AI 同事**，不是表单系统、不是群发机器人、也不是重 OA 任务平台。

- **目标**：AI 读表识别负责人与待采集字段 → 分析每行缺失 → 生成含接收人/缺项/话术/截止时间的催办任务 → 人工确认 → 发送并留痕。
- **非目标（一期明确不做）**：低代码表单搭建、替代 Excel 填报流程、复杂绩效/规则引擎、主管抄送与升级策略、自动强管控。
- **一期边界**：聚焦"AI 表格分析 + 催办任务生成 + 人工确认发送"。表格填写沿用现有流程，WPS API 定时同步列为后续增强。
- **关键风险（已内化为产品约束）**：表格格式不稳定则自动判定失准；AI 误识别不可自动发送（必须人工确认）；Excel 全文不进模型（程序化裁剪）；权限不清则敏感数据外泄；催办过频伤协作。

## 2. 核心流程与 MVP 能力（方案 + MVP 设计）

**主流程**：上传 Excel（或 WPS 下载）→ 输入一句自然语言要求（"催还没补齐合同金额和预计完成时间的人"）→ AI/规则识别列与缺项 → 生成任务草稿（负责人/联系方式/缺项/当前内容/话术/截止）→ 人工确认或逐条调整 → 发送或生成待发列表 → 重新上传新版 → 已补齐自动关闭、仍缺失更新摘要。

**MVP 功能清单**（基本全部落地）：

| 模块 | 早期设想 | 现状落点 |
| --- | --- | --- |
| 表格解析 | 多 Sheet、表头探测、合并单元格 | `lib/excel/`（SheetJS） |
| 表结构画像 | 非空率/类型猜测/样例抽取，供 AI 决策 | `lib/excel/tableProfile.ts` |
| AI 识列/缺项 | OpenAI 兼容 + 失败回退规则 | `lib/ai/` + `providers/ai-routing.service.ts` |
| 联系人识别 | 按姓名/工号/邮箱匹配内部员工，失败进人工 | `providers/contact.service.ts`（按姓名精确匹配通讯录） |
| 催办生成 | 每项含来源行/缺项/建议文案/截止，支持合并 | `providers/followup.service.ts` |
| 消息发送 | 一期 ManualCopy（复制文案）→ 后续接渠道 | `lib/messaging/sender.ts`（仍为 manual 复制） |
| 状态同步 | 重新上传新版 → 增/补/仍缺对账预览再应用 | `/refresh-preview` + `/refresh/confirm` |
| 审计留痕 | 记录提醒时间/渠道/接收人/模板/结果 | `reminder_events` 表 + 留痕 UI |
| 通讯录 | 内部员工通讯录/导入员工表 | `address_book_contacts` 表 + `/api/address-book` |

**提交状态判定**（早期规则 → 落地为按"负责人列 + 采集列完整度"判定，见 [ADR-003](./adr-003-excel-status-by-column-completeness.md)）：必填全非空=已提交；部分有值=部分填写；全空=未开始；超截止未交=逾期；人工豁免=豁免；负责人匹配不上=匹配异常（进人工）。

## 3. AI 上下文控制策略（已实现）

核心原则：**绝不把整份 Excel 丢给模型**。落地为分层管线：

1. 程序读全表（表头、类型、非空率、样例、空值分布）；
2. AI 只看**表结构摘要**，决定负责人列/采集列/忽略列（第一次模型调用）；
3. 程序按 AI 选列裁剪，剔除说明文本、附件链接、无关列；
4. 程序先判定缺项行，只有缺项/部分/异常行进入模型；
5. AI 只对裁剪后的待处理行生成缺项摘要与催办文案（第二次调用）。

配套原则：单次调用控制 token 预算；大表分批；样例默认脱敏；AI 输出强制 JSON 且程序校验。

## 4. 领域模型与数据表（草案 → 现状对照）

早期《领域模型》提出 12 个概念实体，多数在实现中**简化/改名**。表名 1:1 落到现状的只有 7 张（即下方标 ✅ 者），其余概念被合并或由字段承载：

| 早期概念（草案） | 落地情况 | 备注 |
| --- | --- | --- |
| CollectionTask / AnalysisSession | ✅ `analysis_sessions` | 采用轻量"会话"而非重任务体系 |
| SheetSnapshot | ✅ `sheet_snapshots` | 每次上传存快照，支持对账追溯 |
| AiTableAnalysis | ✅ `ai_table_analyses` | 结构化保存 AI 输出（JSON） |
| ContactMatch | ✅ `contact_matches` | |
| FollowupItem | ✅ `followup_items` | "谁还缺什么" |
| FollowupTask | ✅ `followup_tasks` | "发给谁、怎么说" |
| ReminderEvent | ✅ `reminder_events` | 审计留痕，必须存消息快照 |
| Participant | ❌ 并入 followup_items | 由 displayName/employeeId 承载 |
| FormSource | ❌ 仅 source_type/source_ref 字段 | WPS API 未实现 |
| Submission | ❌ 快照 + 列完整度替代 | 见 ADR-003 |
| ColumnMapping | ❌ ai_table_analyses.inferred_columns_json | AI 列映射存 JSON |
| ReminderRule / MessageTemplate | ❌ 一期不做规则引擎/模板表 | 文案由 AI 生成 + 人工编辑 |

最终 **10 张表**（以 `backend-ts/src/database/schema.ts` 为准）：上述 7 张业务表 + `id_counter`（主键自增，从 1000 起）+ `address_book_contacts`（通讯录）+ `app_settings`（AI Key 等设置）。领域模型中的**状态枚举被大幅精简**，当前仅 followup_items 与 followup_tasks 两组核心状态，详见代码。

**仍然有效的领域不变量**（早期提炼，实现遵循）：AI 产物必须人工确认后才发送；草稿与最终文案都保存；负责人列空行不进自动催办；无法匹配员工的不自动发送；每次同步保留快照版本以便追溯；AI 输出结构化保存。

## 5. 技术选型演变（早期建议 → 实际落地）

| 阶段 | 后端 | 数据库 | 备注 |
| --- | --- | --- | --- |
| 早期规划（本文档） | Java 17/21 + Spring Boot 3 + Spring AI + MyBatis | MySQL 8 | 架构建议稿的推荐栈 |
| 实现 1（已弃） | Java 版实际开发后弃用 | H2 | 源码在 git 历史，另有本地备份 |
| 实现 2（已弃） | Node.js + Express + TS + SheetJS | SQLite（node:sqlite） | |
| 实现 3（曾采用） | **NestJS 12**（Express 5 内核） | SQLite（node:sqlite） | [ADR-005](./adr-005-backend-nestjs.md) |
| **当前** | NestJS 12 | **better-sqlite3 + Drizzle ORM** | [ADR-006](./adr-006-better-sqlite3-drizzle.md)，Node 18/20/22 均可 |

前端始终为 **Vue 3 + TS + Element Plus + Pinia + Vue Router**（早期建议与现状一致）。早期架构图里的后端模块划分（session/workbook/table-profile/ai-analysis/followup/contact/sender）与现状目录（`providers/` 业务服务 + `lib/` 纯函数）一一对应，仅组织形态不同。

**演进触发条件**（原异步/队列引入门槛，仍可作为路线图参考）：单次解析 >120s、单文件 >20MB 或 5 万行、多人并发阻塞、WPS API 定时拉取、海量原文件留档、消息需重试/定时/批量调度。

## 6. 遗留待确认问题（原《待确认问题》要点与当前答案）

规划期提出约 15 个开放问题，多数已被实现决策回答：

- 催办对象仅内部员工 ✅（通讯录模块）
- 一期 Excel 上传、WPS 下载表单 ⚠️（WPS API 未做）
- 发起人可见填写内容与状态 ✅
- 逾期自动抄送主管：**不做**（进入 README 路线图候选）
- 姓名需工号/邮箱辅助消歧 ✅（contact 匹配 + 通讯录）
- 同表多行负责人：可多行，逐行判定/合并 ✅（多人合并行展开）
- 采集列必填可配置：由用户自然语言指令决定 ✅
- 统一认证/组织架构/消息网关/权限：**仍开放**，见 README 路线图

## 附：合并前文档清单

| 原文件 | 大小 | 内容主题 |
| --- | --- | --- |
| `reminder-tool-plan.md` | 8.5KB | 产品方案：目标/非目标/流程/MVP/风险/一期边界 |
| `mvp-technical-design.md` | 11.8KB | 系统模块、上下文控制 5 步、表草案、接口草案、里程碑 |
| `architecture-recommendation.md` | 5.8KB | 技术架构建议（Java 栈）、模块划分、演进触发条件 |
| `domain-model.md` | 5.1KB | 12 个领域实体、状态枚举、领域关系与不变量 |
| `open-questions.md` | 2.5KB | 规划期待确认问题清单 |
