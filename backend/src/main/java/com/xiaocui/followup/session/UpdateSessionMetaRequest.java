package com.xiaocui.followup.session;

/**
 * 修改催办任务元信息（任务名称 / 截止时间）。
 * title 为空表示保持原值；dueAt 为空字符串表示清空截止时间，null 表示保持原值。
 */
public record UpdateSessionMetaRequest(
        String title,
        String dueAt
) {
}
