# 领域模型

## 核心概念

### CollectionTask

信息收集任务。描述一次需要多个对象反馈信息的业务活动。轻量版本中也可以称为一次 `AnalysisSession`，避免一开始把产品做成重型任务管理系统。

关键字段：

- id
- title
- description
- owner_id
- form_source_id
- due_at
- status
- created_at
- archived_at

### Participant

应填对象。一期只包含企业内部员工，由 Excel/WPS 表格中的负责人列识别。

关键字段：

- id
- task_id
- subject_type
- subject_id
- display_name
- department_id
- backup_contact_id
- status
- last_activity_at
- exemption_reason
- source_row_no
- match_status

### FormSource

表单来源。系统可以不拥有表单，只需要知道如何访问表格、解析字段并同步状态。一期以 Excel 上传为主，后续支持通过内网 WPS API 下载表格。

关键字段：

- id
- type
- name
- submit_url
- sync_mode
- sync_config
- worksheet_name
- header_row_index

可选类型：

- manual
- excel_upload
- wps_api

### Submission

一次填写或反馈记录。对于 Excel/WPS 场景，可以理解为某个负责人对应行在一次同步快照中的采集字段内容。

关键字段：

- id
- task_id
- participant_id
- external_submission_id
- status
- submitted_at
- reviewed_at
- reviewer_id
- issue_summary
- content_snapshot
- source_version

### ColumnMapping

表格列映射。由 AI 自动推断，发起人可以确认或修正。定义哪一列是负责人，哪些列用于判断提交，哪些列只用于展示或辅助筛选。

关键字段：

- id
- task_id
- responsible_person_column
- required_collection_columns
- optional_collection_columns
- department_column
- remark_column

### SheetSnapshot

表格同步快照。记录某次上传或从 WPS API 下载后解析出的表格版本。

关键字段：

- id
- task_id
- source_type
- source_version
- file_name
- downloaded_at
- parsed_at
- row_count
- parse_status
- parse_error

### ReminderRule

催办规则。定义什么条件下、对谁、通过什么渠道发送什么提醒。

关键字段：

- id
- task_id
- trigger_type
- trigger_offset
- repeat_interval
- max_times
- target_scope
- channel
- template_id
- escalation_policy_id
- enabled

### ReminderEvent

一次具体催办事件。

关键字段：

- id
- task_id
- participant_id
- rule_id
- channel
- recipient_id
- message_snapshot
- status
- sent_at
- failed_reason

### MessageTemplate

消息模板。用于生成提醒文案。

关键字段：

- id
- name
- tone
- channel
- body
- variables

### AiTableAnalysis

AI 对表格的一次结构化分析结果。

关键字段：

- id
- task_id
- sheet_snapshot_id
- model_name
- prompt_version
- table_summary
- inferred_columns
- followup_items
- risks
- raw_output

### FollowupItem

AI 从表格中提取的一条待补充事项。它回答“谁还缺什么”。

关键字段：

- id
- task_id
- participant_id
- source_rows
- missing_fields
- filled_fields_snapshot
- issue_summary
- status
- due_at

### FollowupTask

可发送的催办任务。它回答“发给谁、怎么说、何时发”。

关键字段：

- id
- task_id
- followup_item_id
- recipient_id
- message_draft
- message_final
- channel
- status
- sent_at
- closed_at

## 重要状态

### TaskStatus

- draft
- active
- closed
- completed
- archived

### ParticipantStatus

- not_started
- in_progress
- submitted
- partially_filled
- needs_revision
- confirmed
- overdue
- exempted
- match_error

### ReminderStatus

- pending
- sent
- failed
- skipped
- cancelled

## 领域关系

- 一个 `CollectionTask` 有多个 `Participant`。
- 一个 `CollectionTask` 绑定一个 `FormSource`。
- 一个 `CollectionTask` 有一个 `ColumnMapping`。
- 一个 `CollectionTask` 可以有多个 `SheetSnapshot`。
- 一个 `SheetSnapshot` 可以产生一个或多个 `AiTableAnalysis`。
- 一个 `AiTableAnalysis` 可以产生多个 `FollowupItem`。
- 一个 `FollowupItem` 可以生成一个或多个 `FollowupTask`。
- 一个 `Participant` 可以有零到多个 `Submission`。
- 一个 `CollectionTask` 可以配置多个 `ReminderRule`。
- 一个 `ReminderRule` 可以产生多个 `ReminderEvent`。
- 一个 `ReminderEvent` 必须保存消息快照，避免后续模板变更影响审计。

## 领域不变量

- 已归档任务不能继续发送自动提醒。
- 已豁免对象不能被普通逾期规则催办。
- 人工修改填写状态必须记录操作者和原因。
- 提醒发送前必须检查免打扰时间和最大提醒次数。
- 不能向无权限人员展示表单敏感内容，但可以展示提交状态。
- 负责人列为空的行不能进入自动催办，只能进入异常处理。
- 无法匹配到内部员工的负责人不能自动发送提醒。
- 表格每次同步后必须保留快照版本，避免状态争议无法追溯。
- AI 生成的催办任务必须经过发起人确认后才能发送。
- AI 草稿和人工编辑后的最终消息都要保存。
- AI 输出必须结构化保存，不能只保存自然语言结果。
