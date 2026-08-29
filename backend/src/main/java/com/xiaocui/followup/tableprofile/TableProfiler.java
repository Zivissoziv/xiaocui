package com.xiaocui.followup.tableprofile;

import com.xiaocui.followup.workbook.SheetData;
import com.xiaocui.followup.workbook.WorkbookSnapshot;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;

@Service
public class TableProfiler {
    public WorkbookProfile profile(WorkbookSnapshot snapshot) {
        List<WorkbookProfile.SheetProfile> sheets = snapshot.sheets().stream().map(this::profileSheet).toList();
        return new WorkbookProfile(snapshot.fileName(), sheets);
    }

    private WorkbookProfile.SheetProfile profileSheet(SheetData sheet) {
        List<ColumnProfile> columns = new ArrayList<>();
        for (String header : sheet.headers()) {
            List<String> values = sheet.rows().stream()
                    .map(row -> row.values().getOrDefault(header, ""))
                    .filter(value -> !value.isBlank())
                    .toList();
            LinkedHashSet<String> unique = new LinkedHashSet<>(values);
            columns.add(new ColumnProfile(
                    header,
                    guessType(header, values),
                    sheet.rows().isEmpty() ? 0 : Math.round(values.size() * 100.0 / sheet.rows().size()) / 100.0,
                    unique.size(),
                    unique.stream().limit(3).toList()
            ));
        }
        return new WorkbookProfile.SheetProfile(sheet.sheetName(), sheet.rows().size(), sheet.headerRowIndex(), columns);
    }

    private String guessType(String header, List<String> values) {
        String lower = header.toLowerCase(Locale.ROOT);
        if (containsAny(lower, "负责人", "责任人", "姓名", "联系人", "经办人")) return "person_name";
        if (containsAny(lower, "部门", "单位", "组织", "区域")) return "department";
        if (containsAny(lower, "邮箱", "email", "mail") || values.stream().anyMatch(value -> value.matches("\\S+@\\S+\\.\\S+"))) return "email";
        if (containsAny(lower, "手机", "电话", "phone") || values.stream().anyMatch(value -> value.matches("1\\d{10}"))) return "phone";
        if (containsAny(lower, "时间", "日期") || values.stream().anyMatch(value -> value.matches(".*\\d{4}[-/年]\\d{1,2}.*"))) return "date";
        if (containsAny(lower, "金额", "收入", "成本") || values.stream().anyMatch(value -> value.matches("-?\\d+(\\.\\d+)?"))) return "number";
        return "text";
    }

    private boolean containsAny(String value, String... keywords) {
        for (String keyword : keywords) {
            if (value.contains(keyword.toLowerCase(Locale.ROOT))) return true;
        }
        return false;
    }
}
