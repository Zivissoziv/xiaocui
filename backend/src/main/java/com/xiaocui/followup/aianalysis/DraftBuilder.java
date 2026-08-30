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

    /** 一行里的负责人及联系方式按同样分隔符拆分后，按位置一一对应。 */
    private record OwnerRow(SheetData.RowData row, int index,
                            List<String> emails, List<String> phones,
                            List<String> employees, List<String> departments) {
    }

    public List<FollowupDraft> build(SheetData sheet, ColumnPlan plan, String instruction, String dueAt, List<String> risks) {
        Map<String, List<OwnerRow>> grouped = new LinkedHashMap<>();
        for (SheetData.RowData row : sheet.rows()) {
            List<String> owners = splitValues(get(row, plan.ownerColumn()));
            List<String> emails = splitValues(get(row, plan.emailColumn()));
            List<String> phones = splitValues(get(row, plan.phoneColumn()));
            List<String> employees = splitValues(get(row, plan.employeeColumn()));
            List<String> departments = splitValues(get(row, plan.departmentColumn()));
            if (owners.isEmpty()) owners = List.of("未识别负责人-" + row.rowNumber());
            for (int index = 0; index < owners.size(); index++) {
                grouped.computeIfAbsent(owners.get(index), ignored -> new ArrayList<>())
                        .add(new OwnerRow(row, index, emails, phones, employees, departments));
            }
        }

        List<FollowupDraft> drafts = new ArrayList<>();
        grouped.forEach((owner, ownerRows) -> {
            LinkedHashSet<String> missing = new LinkedHashSet<>();
            Map<String, String> filled = new LinkedHashMap<>();
            List<Integer> sourceRows = new ArrayList<>();
            LinkedHashSet<String> businessValues = new LinkedHashSet<>();

            for (OwnerRow entry : ownerRows) {
                SheetData.RowData row = entry.row();
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

            OwnerRow sample = ownerRows.get(0);
            String displayName = owner.startsWith("未识别负责人-") ? "未识别负责人" : owner;
            String email = pickAt(sample.emails(), sample.index());
            String phone = pickAt(sample.phones(), sample.index());
            String employee = pickAt(sample.employees(), sample.index());
            String department = pickAt(sample.departments(), sample.index());
            String businessSummary = businessValues.isEmpty() ? "来源行 " + joinNumbers(sourceRows) : String.join("，", businessValues);
            String issueSummary = "第 %s 行缺少 %s".formatted(joinNumbers(sourceRows), String.join("、", missing));

            if (displayName.equals("未识别负责人")
                    || allBlank(email, phone)) {
                risks.add("第 %s 行负责人或邮箱需要人工确认。".formatted(joinNumbers(sourceRows)));
            }

            drafts.add(new FollowupDraft(
                    displayName,
                    employee,
                    department,
                    email,
                    phone,
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

    /** 按逗号/顿号/分号/斜杠/空白拆分一个单元格里的多个值（如多个负责人、多个邮箱）。 */
    private List<String> splitValues(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        return java.util.Arrays.stream(raw.split("[、，,;；/\\s]+"))
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .toList();
    }

    /** 取拆分后第 index 个值，越界返回空串（如一行只有一个邮箱但有两个负责人）。 */
    private String pickAt(List<String> values, int index) {
        return values != null && index < values.size() ? values.get(index) : "";
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
