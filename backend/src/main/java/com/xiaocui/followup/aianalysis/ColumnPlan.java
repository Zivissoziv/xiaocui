package com.xiaocui.followup.aianalysis;

import java.util.List;

public record ColumnPlan(
        String sheetName,
        String ownerColumn,
        String departmentColumn,
        String employeeColumn,
        String emailColumn,
        String phoneColumn,
        List<String> businessKeyColumns,
        List<String> requiredColumns
) {
}
