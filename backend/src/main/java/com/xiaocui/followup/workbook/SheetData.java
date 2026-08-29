package com.xiaocui.followup.workbook;

import java.util.List;
import java.util.Map;

public record SheetData(
        String sheetName,
        int headerRowIndex,
        List<String> headers,
        List<RowData> rows
) {
    public record RowData(int rowNumber, Map<String, String> values) {
    }
}
