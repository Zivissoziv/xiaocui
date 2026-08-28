# MVP 技术设计

## 一期定位

一期建设一个轻量内网 AI 催办工具，用于上传 Excel 表格，让 AI 分析表格结构、提取联系人和待补充信息，并生成催办任务。系统不负责在线编辑表格，不先建设复杂规则引擎，不引入异步任务、队列和对象存储，只负责读取、AI 分析、人工确认、发送催办和刷新状态。

## 系统模块

### 上传与会话

- 上传 Excel。
- 输入自然语言催办要求。
- 保存一次分析会话，避免先建立重型任务体系。

### 表格读取

- 支持本地 Excel 上传。
- 保存每次同步快照。
- 解析 Sheet、表头、数据行和单元格内容。

### AI 表格分析

- 识别表格用途和字段含义。
- 推断负责人列、部门列、联系方式列和采集列。
- 按行提取已填内容、缺失字段和疑似异常。
- 聚合同一负责人的多行待补充事项。
- 输出结构化 JSON，供前端确认和后端入库。
- 不把整个 Excel 原文直接传入模型，先由程序做列统计、样例抽取和无关字段裁剪。

### 联系人匹配

- 根据姓名、工号、邮箱、手机号、部门匹配内部员工。
- 匹配不到或多候选时进入人工确认。
- 一期只做联系人匹配，不处理主管抄送。

### 催办任务生成

- 根据 AI 分析结果生成催办任务草稿。
- 每个任务包含待补充字段、来源行、建议文案、接收人和截止时间。
- 支持发起人批量确认、逐条编辑、合并同一负责人的任务。

## 上下文控制策略

Excel 分析采用“程序预处理 + AI 决策 + 程序执行 + AI 生成文案”的分层方式，避免把整个 Excel 所有内容传入模型。

### 第 1 步：程序读取完整 Excel

后端用确定性代码读取整个工作簿，但不直接发送给大模型。

程序先提取：

- Sheet 名称、行数、列数。
- 每列表头、数据类型、非空率、唯一值数量。
- 每列前几条脱敏样例。
- 是否像姓名、工号、邮箱、手机号、部门、日期、金额、状态、备注。
- 空值分布，例如哪些列缺失最多。

### 第 2 步：AI 只看表结构摘要

第一次调用模型只传结构摘要，不传完整业务数据。让 AI 判断：

- 哪些 Sheet 需要分析。
- 哪列像负责人。
- 哪些列像联系人辅助字段。
- 哪些列像待采集字段。
- 哪些列可以忽略。
- 是否需要用户确认。

### 第 3 步：程序按 AI 选择裁剪数据

程序根据 AI 的列选择，只保留催办所需字段：

- 负责人列。
- 工号、邮箱、手机号、部门等匹配字段。
- 被判断为待采集的字段。
- 必要的业务定位字段，例如项目名称、合同编号、事项名称。

明确剔除：

- 大段说明文本。
- 附件链接。
- 历史备注。
- 已完成且不影响催办的字段。
- 与本次用户指令无关的列。

### 第 4 步：程序先判定缺项行

缺项判定尽量由程序做，AI 只处理模糊场景。

程序可以直接判断：

- 必填列为空。
- 负责人为空。
- 邮箱或手机号格式异常。
- 日期、金额等格式明显不合法。
- 整行已完成，无需进入模型。

只有这些数据进入下一轮 AI：

- 缺项行。
- 部分填写行。
- 疑似异常行。
- 负责人匹配不确定的行。

### 第 5 步：AI 生成催办摘要和文案

第二次调用模型只传裁剪后的待处理数据，让 AI 输出：

- 每个负责人的待补充事项。
- 多行缺项合并摘要。
- 催办文案草稿。
- 风险提示。

## 推荐 Prompt 输入结构

```json
{
  "user_instruction": "请催还没补充合同金额和预计完成时间的人，明天下午 6 点前反馈",
  "workbook_summary": {
    "file_name": "项目合同信息收集.xlsx",
    "sheets": [
      {
        "sheet_name": "项目清单",
        "row_count": 320,
        "column_profiles": [
          {
            "column": "负责人",
            "type_guess": "person_name",
            "non_empty_rate": 0.98,
            "sample_values": ["张三", "李四", "王五"]
          },
          {
            "column": "合同金额",
            "type_guess": "amount",
            "non_empty_rate": 0.61,
            "sample_values": ["120000", "85000"]
          }
        ]
      }
    ]
  }
}
```

## 推荐 AI 裁剪后输入结构

```json
{
  "user_instruction": "请催还没补充合同金额和预计完成时间的人，明天下午 6 点前反馈",
  "selected_columns": {
    "owner": "负责人",
    "employee_id": "工号",
    "department": "部门",
    "business_keys": ["项目名称"],
    "required_fields": ["合同金额", "预计完成时间"]
  },
  "rows_needing_attention": [
    {
      "sheet": "项目清单",
      "row_number": 12,
      "负责人": "张三",
      "工号": "A1024",
      "部门": "华东销售部",
      "项目名称": "XX 项目",
      "合同金额": "",
      "预计完成时间": ""
    }
  ]
}
```

## 上下文预算建议

- 单次模型调用控制在可预测 token 预算内。
- 大表按 Sheet、部门或负责人分批分析。
- 每批只传缺项行，不传已完成行。
- 每行只传必要字段和来源位置。
- 样例值默认脱敏，只有生成催办文案时才传必要业务定位字段。
- 对超过阈值的大表，先生成待确认的列映射和缺项统计，再由用户选择是否继续生成催办任务。

### 消息发送与留痕

- 一期可以先对接单一内部消息渠道。
- 若真实消息渠道暂未确定，可先实现“待发送列表 + 手动复制文案”模式。
- 后续扩展企业微信、钉钉、飞书、邮件或内部消息网关。

### 刷新状态

- 重新上传 Excel 最新版。
- AI/规则重新分析缺失项。
- 已补充的催办任务自动关闭。
- 仍缺失的任务更新缺项摘要。

## 技术栈

### 前端

- Vue 3
- TypeScript
- Element Plus
- Pinia
- Vue Router
- Axios

### 后端

- Java 17 或 Java 21
- Spring Boot 3
- Spring AI
- MyBatis 或 MyBatis-Plus
- MySQL 8
- EasyExcel，必要时补充 Apache POI

### 一期暂不引入

- 异步任务队列。
- Redis。
- 对象存储。
- 微服务拆分。
- WPS API 自动同步。

### 轻量看板

- 查看待催、已催、已补充、仍缺失、需人工确认。
- 查看每个负责人的填写内容、缺失项和最近催办时间。
- 导出 AI 分析结果、催办任务和发送记录。

## 推荐数据库表

### analysis_sessions

- id
- title
- owner_id
- source_type
- source_ref
- user_instruction
- due_at
- status
- created_at
- updated_at

### sheet_snapshots

- id
- session_id
- source_type
- source_version
- file_name
- local_file_path
- file_hash
- downloaded_at
- parsed_at
- row_count
- parse_status
- parse_error

### ai_table_analyses

- id
- session_id
- sheet_snapshot_id
- model_name
- prompt_version
- table_summary
- worksheet_name
- header_row_index
- inferred_columns_json
- risks_json
- raw_output_json
- created_at

### contact_matches

- id
- session_id
- source_row_no
- raw_contact_text
- employee_id
- display_name
- department_id
- match_status
- candidates_json
- confirmed_by
- confirmed_at

### followup_items

- id
- session_id
- contact_match_id
- employee_id
- display_name
- department_id
- source_rows_json
- missing_fields_json
- filled_fields_snapshot_json
- issue_summary
- status
- due_at
- created_at
- updated_at

### followup_tasks

- id
- session_id
- followup_item_id
- recipient_id
- channel
- message_draft
- message_final
- status
- scheduled_at
- sent_at
- closed_at

### reminder_events

- id
- session_id
- followup_task_id
- channel
- recipient_id
- message_snapshot
- status
- sent_at
- failed_reason

## AI 分析输出 JSON 草案

```json
{
  "table_summary": "本表用于收集各项目的合同金额和预计完成时间",
  "columns": {
    "owner": "负责人",
    "department": "部门",
    "employee_id": "工号",
    "required_fields": ["合同金额", "预计完成时间"],
    "optional_fields": ["备注"]
  },
  "followup_items": [
    {
      "source_rows": [12, 18],
      "owner_raw": "张三",
      "employee_hint": "A1024",
      "department_hint": "华东销售部",
      "missing_fields": ["合同金额", "预计完成时间"],
      "filled_fields": {
        "项目名称": "XX 项目"
      },
      "issue_summary": "第 12 行缺合同金额，第 18 行缺预计完成时间",
      "message_draft": "张三你好，XX 项目还有合同金额、预计完成时间待补充，请在明天下午 6 点前更新表格。"
    }
  ],
  "risks": [
    {
      "type": "ambiguous_owner",
      "source_row": 22,
      "detail": "负责人为李明，但通讯录中存在两个同名人员"
    }
  ]
}
```

## 轻量状态流转

### FollowupItemStatus

- draft
- pending_confirmation
- ready_to_send
- sent
- partially_resolved
- resolved
- needs_manual_review
- cancelled

### FollowupTaskStatus

- draft
- approved
- scheduled
- sent
- failed
- closed

## AI 分析伪代码

```text
workbook = parse_excel(file)
profiles = profile_workbook(workbook)

column_plan = ai_select_relevant_columns(profiles, user_instruction)
rows_needing_attention = find_missing_rows(workbook, column_plan)
trimmed_rows = project_rows(rows_needing_attention, column_plan)

analysis = ai_generate_followups(trimmed_rows, user_instruction)

for each item in analysis.followup_items:
  match = match_employee(item.owner_raw, item.employee_hint, item.department_hint)

  if match is ambiguous or missing:
    create followup item with needs_manual_review
    continue

  create followup item with missing fields and filled snapshot
  create followup task draft with AI message

user confirms or edits tasks
send approved tasks
```

## 刷新状态伪代码

```text
latest_workbook = fetch_latest_excel()
latest_analysis = ai_analyze_table(latest_workbook, original_instruction)

for each open followup item:
  compare latest missing_fields with previous missing_fields

  if missing_fields is empty:
    mark item resolved
    close related followup tasks
  else:
    update missing_fields and issue_summary
```

## 人工确认原则

- AI 可以自动分析和生成任务，但不直接自动发送。
- 负责人匹配失败或同名多候选时，必须人工确认。
- 一期不生成主管抄送或升级动作。
- 发起人编辑后的最终消息要保存，不能只保存 AI 草稿。

## 一期接口草案

```text
POST   /api/analysis-sessions
POST   /api/analysis-sessions/{sessionId}/excel
POST   /api/analysis-sessions/{sessionId}/analyze
GET    /api/analysis-sessions/{sessionId}/analysis
GET    /api/analysis-sessions/{sessionId}/followup-items
PATCH  /api/followup-items/{itemId}
POST   /api/analysis-sessions/{sessionId}/followup-tasks/generate
PATCH  /api/followup-tasks/{taskId}
POST   /api/followup-tasks/{taskId}/send
POST   /api/analysis-sessions/{sessionId}/refresh
GET    /api/analysis-sessions/{sessionId}/reminder-events
```

## 开发里程碑

### M1: Excel 上传与 AI 分析

- 上传 Excel。
- 输入自然语言催办要求。
- AI 识别负责人列、采集列和缺失项。
- 展示分析结果和风险提示。

### M2: 联系人匹配与人工确认

- 对接内部员工通讯录或导入员工表。
- 匹配负责人和部门。
- 支持处理同名、未匹配、空负责人。

### M3: 催办任务生成

- 根据缺失项生成催办任务草稿。
- AI 生成具体催办文案。
- 支持批量确认、逐条编辑、合并任务。

### M4: 发送与留痕

- 接入一个内部消息渠道，或先实现待发送列表。
- 保存发送记录和最终消息。

### M5: WPS API 刷新

- 暂不纳入一期。
- 一期通过重新上传 Excel 最新版刷新状态。
