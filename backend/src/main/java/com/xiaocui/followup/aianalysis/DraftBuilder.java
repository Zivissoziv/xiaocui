package com.xiaocui.followup.aianalysis;

import com.xiaocui.followup.workbook.SheetData;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * 确定性的缺项判定与聚合。
 * 不管列是谁（规则还是模型）识别出来的，缺哪些项都交给程序按空值判断，不丢给模型瞎猜。
 */
@Component
public class DraftBuilder {

    public List<FollowupDraft> build(SheetData sheet, ColumnPlan plan, String instruction, String dueAt, List<String> risks) {
        Map<String, List<SheetData.RowData>> grouped = new LinkedHashMap<>();
        for (SheetData.RowData row : sheet.rows()) {
            String owner = get(row, plan.ownerColumn());
            String key = owner.isBlank() ? "未识别负责人-" + row.rowNumber() : owner;
            grouped.computeIfAbsent(key, ignored -> new ArrayList<>()).add(row);
        }

        List<FollowupDraft> drafts = new ArrayList<>();
        grouped.forEach((owner, rows) -> {
            LinkedHashSet<String> missing = new LinkedHashSet<>();
            Map<String, String> filled = new LinkedHashMap<>();
            List<Integer> sourceRows = new ArrayList<>();
            LinkedHashSet<String> businessValues = new LinkedHashSet<>();

            for (SheetData.RowData row : rows) {
                sourceRows.add(row.rowNumber());
                for (String required : plan.requiredColumns()) {
                    String value = get(row, required);
                    if (value.isBlank()) missing.add(required);
                    else filled.put(required, value);
                }
                for (String businessKey : plan.businessKeyColumns()) {
                    String value = get(row, businessKey);
                    if (!value.isBlank()) businessValues.add(value);
                }
            }
            if (missing.isEmpty()) return;

            SheetData.RowData sample = rows.get(0);
            String displayName = owner.startsWith("未识别负责人-") ? "未识别负责人" : owner;
            String businessSummary = businessValues.isEmpty() ? "来源行 " + joinNumbers(sourceRows) : String.join("，", businessValues);
            String issueSummary = "第 %s 行缺少 %s".formatted(joinNumbers(sourceRows), String.join("、", missing));

            if (displayName.equals("未识别负责人")
                    || allBlank(get(sample, plan.emailColumn()), get(sample, plan.phoneColumn()))) {
                risks.add("第 %s 行负责人或邮箱需要人工确认。".formatted(joinNumbers(sourceRows)));
            }

            drafts.add(new FollowupDraft(
                    displayName,
                    get(sample, plan.employeeColumn()),
                    get(sample, plan.departmentColumn()),
                    get(sample, plan.emailColumn()),
                    get(sample, plan.phoneColumn()),
                    sourceRows,
                    new ArrayList<>(missing),
                    filled,
                    businessSummary,
                    issueSummary,
                    buildMessage(displayName, new ArrayList<>(missing), businessSummary, instruction, dueAt)
            ));
        });
        return drafts;
    }

    public String buildMessage(String owner, List<String> missing, String businessSummary, String instruction, String dueAt) {
        String due = dueAt == null || dueAt.isBlank() ? "截止时间前" : dueAt;
        String instructionText = instruction == null || instruction.isBlank() ? "" : "本次要求：" + instruction + "。";
        return "%s你好，%s你负责的 %s 还有 %s 待补充，请在 %s 前更新表格，谢谢。"
                .formatted(owner, instructionText, businessSummary, String.join("、", missing), due);
    }

    private String get(SheetData.RowData row, String column) {
        if (column == null || column.isBlank()) return "";
        return row.values().getOrDefault(column, "");
    }

    private String joinNumbers(List<Integer> values) {
        return values.stream().map(String::valueOf).reduce((left, right) -> left + "、" + right).orElse("");
    }

    private boolean allBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) return false;
        }
        return true;
    }
}
