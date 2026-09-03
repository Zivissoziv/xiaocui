# ADR-006: 数据层采用 better-sqlite3 + Drizzle ORM（从 node:sqlite 迁移）

## 状态

已采纳

## 背景

NestJS 迁移（ADR-005）时数据层保留 `node:sqlite` + 手写 SQL，当时选择了「不引入原生模块、依赖全纯 JS」的部署方案：Windows 打包的 node_modules 可直接拷到 Linux 服务器跑。

该方案的代价是 **Node 版本被锁死在 ≥ 22.5**（`node:sqlite` 为 Node 22 内置实验模块）。用户明确不想依赖 Node 22（服务器环境 Node 20 也在候选），需要解除该限制。同时手写 SQL 的列名/参数映射靠 `as any` 维持，无类型保护。

## 备选方案

| 方案 | 结论 |
| --- | --- |
| **better-sqlite3 + Drizzle（采纳）** | C++ 原生模块，npm 安装时按平台取预编译二进制（约 2MB，无需编译工具链）。Node 18/20/22 均可运行，直接解除 Node 22 依赖。Drizzle 轻量、无代码生成步骤、类型推断好。 |
| Prisma（+驱动适配器） | 否。Prisma 自带 Rust 查询引擎二进制（每平台几十 MB），仍有平台绑定问题且更重；需要 `prisma generate` 步骤与 `schema.prisma`，NestJS 集成成本更高。**Prisma 的 SQLite 并不是"内置驱动"，原生二进制一个都少不了。** |
| 维持 node:sqlite | 否，锁死 Node ≥ 22.5，与需求冲突。 |
| libsql / sql.js 等纯 JS/WASM | libsql 仍是原生模块；sql.js（WASM）无 WAL、需手动持久化，不适合本项目。 |

## 决策

2026-09-03 将数据层迁移到 **better-sqlite3 + Drizzle ORM**：

- 新增 `src/database/schema.ts`：10 张表的 drizzle `sqliteTable` 定义，列名/索引与原 DDL 逐列一致。
- `database.provider.ts`：better-sqlite3 打开 + `drizzle()` 包装；**幂等 DDL（IF NOT EXISTS）保留在 provider 内**——已有 `data/` 库直接沿用，无需 drizzle-kit 迁移。
- `repository.service.ts`、`address-book.service.ts`、`settings.service.ts` 的手写 SQL 全部改为 drizzle 查询构建器；事务改用 `db.transaction()`；`app_settings` 写入改用 `onConflictDoUpdate` upsert（行为等价）。
- 领域类型继承 Java 版非空约定（如 `ownerId`/`displayName`），而 DB 列可空，映射处显式收窄——比原来的 `as any` 更诚实。

## 验证

- `tsc` 通过；契约快照 `better-sqlite3-drizzle` vs `baseline-nestjs`：47 探针中 46 完全一致，唯一差异为通讯录导出文件名中的日期（09-02 → 09-03），属时间戳漂移，非行为差异。
- 真实库 `data/ai_followup.db`（9 会话/51 事项/51 任务/4 设置）better-sqlite3 只读读取正常；副本起服冒烟 `/api/analysis-sessions`、详情、AI 设置接口正常。

## 影响

- **收益**：Node 版本要求解除（18/20/22 均可）；数据层获得类型安全；事务表达更清晰。
- **代价**：better-sqlite3 是 C++ 原生模块，`build:prod` 打包的 node_modules **只能在与打包机相同的平台运行**。跨平台部署需在目标平台 `npm ci` 或改用 Docker（`build-prod.js` 注释与打包输出已同步提示）。ADR-005 的"全纯 JS 跨平台 tarball"部署优势至此不再成立。
- `scripts/archive/migrate-h2-to-sqlite.js` 仍用 node:sqlite，属一次性归档脚本，不受影响（需 Node ≥ 22.5 才能再跑，仅历史迁移用）。
