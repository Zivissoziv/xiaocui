package com.xiaocui.followup.aianalysis;

import com.xiaocui.followup.tableprofile.ColumnProfile;
import com.xiaocui.followup.tableprofile.WorkbookProfile;
import com.xiaocui.followup.workbook.SheetData;
import com.xiaocui.followup.workbook.WorkbookSnapshot;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;

/**
 * 关键词规则实现。作为没有配置大模型时的兜底，也供 AI 版在列识别失败时回退。
 */
@Service("ruleBasedAiAnalysisService")
public class RuleBasedAiAnalysisService implements AiAnalysisService {
    private final DraftBuilder draftBuilder;

    public RuleBasedAiAnalysisService(DraftBuilder draftBuilder) {
        this.draftBuilder = draftBuilder;
    }

    @Override
    public AiAnalysisResult analyze(WorkbookSnapshot snapshot, WorkbookProfile profile, String userInstruction, String dueAt) {
        SheetData sheet = snapshot.sheets().stream()
                .max(Comparator.comparingInt(item -> item.rows().size()))
                .orElseThrow(() -> new IllegalArgumentException("没有可分析的 Sheet"));
        WorkbookProfile.SheetProfile sheetProfile = profile.sheets().stream()
                .filter(item -> item.sheetName().equals(sheet.sheetName()))
                .findFirst()
                .orElseThrow();
        ColumnPlan plan = inferColumnPlan(sheet, sheetProfile, userInstruction);
        List<String> risks = new ArrayList<>();
        List<FollowupDraft> drafts = draftBuilder.build(sheet, plan, userInstruction, dueAt, risks);
        String summary = "%s / %s 共读取 %d 行，识别 %s 为负责人列，%s 为待补充字段。（关键词规则识别）".formatted(
                snapshot.fileName(),
                sheet.sheetName(),
                sheet.rows().size(),
                blankToPending(plan.ownerColumn()),
                plan.requiredColumns().isEmpty() ? "待确认字段" : String.join("、", plan.requiredColumns())
        );
        return new AiAnalysisResult(summary, plan, drafts, risks);
    }

    public ColumnPlan inferColumnPlan(SheetData sheet, WorkbookProfile.SheetProfile profile, String instruction) {
        List<String> headers = sheet.headers();
        String owner = findHeader(headers, "负责人", "责任人", "填报人", "联系人", "姓名", "经办人");
        String department = findHeader(headers, "部门", "单位", "组织", "区域", "中心");
        String employee = findHeader(headers, "工号", "员工号", "员工编号", "账号");
        String email = findHeader(headers, "邮箱", "email", "mail");
        String phone = findHeader(headers, "手机", "电话", "联系方式", "phone");
        LinkedHashSet<String> used = new LinkedHashSet<>();
        addIfPresent(used, owner, department, employee, email, phone);

        LinkedHashSet<String> required = new LinkedHashSet<>();
        for (String header : headers) {
            if (!used.contains(header) && instruction != null && instruction.replace(" ", "").contains(header.replace(" ", ""))) {
                required.add(header);
            }
        }
        used.addAll(required);

        List<String> businessKeys = headers.stream()
                .filter(header -> !used.contains(header))
                // 注意：这里的"合同"等关键词会误伤"合同金额"这类采集列，
                // 因此必须先让 required 占位再挑 businessKeys。
                .filter(header -> containsAny(header, "项目", "事项", "合同", "客户", "供应商", "名称", "编号", "主题"))
                .filter(header -> !looksLikeCollectedField(header))
                .limit(3)
                .toList();
        used.addAll(businessKeys);

        if (required.isEmpty()) {
            profile.columnProfiles().stream()
                    .filter(column -> !used.contains(column.column()))
                    .filter(column -> !containsAny(column.column(), "序号", "编号", "工号", "姓名", "负责人", "部门", "邮箱", "手机"))
                    .filter(column -> column.nonEmptyRate() < 0.96 || containsAny(column.column(), "金额", "时间", "日期", "进度", "说明", "备注", "附件", "反馈", "结果"))
                    .map(ColumnProfile::column)
                    .limit(6)
                    .forEach(required::add);
        }
        if (required.isEmpty()) {
            headers.stream().filter(header -> !used.contains(header)).skip(Math.max(0, headers.size() - 3)).forEach(required::add);
        }

        return new ColumnPlan(sheet.sheetName(), owner, department, employee, email, phone, businessKeys, new ArrayList<>(required));
    }

    /** 形如"合同金额""预计完成时间"的列是采集项，不应被当成业务标识列。 */
    private boolean looksLikeCollectedField(String header) {
        return containsAny(header, "金额", "时间", "日期", "进度", "说明", "备注", "附件", "反馈", "结果", "状态");
    }

    private String findHeader(List<String> headers, String... keywords) {
        return headers.stream().filter(header -> containsAny(header, keywords)).findFirst().orElse("");
    }

    private boolean containsAny(String value, String... keywords) {
        String lower = value == null ? "" : value.toLowerCase(Locale.ROOT);
        for (String keyword : keywords) {
            if (lower.contains(keyword.toLowerCase(Locale.ROOT))) return true;
        }
        return false;
    }

    private void addIfPresent(LinkedHashSet<String> values, String... candidates) {
        for (String candidate : candidates) {
            if (candidate != null && !candidate.isBlank()) values.add(candidate);
        }
    }

    private String blankToPending(String value) {
        return value == null || value.isBlank() ? "待确认" : value;
    }
}
