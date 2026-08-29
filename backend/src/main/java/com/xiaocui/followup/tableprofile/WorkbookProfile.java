package com.xiaocui.followup.tableprofile;

import java.util.List;

public record WorkbookProfile(
        String fileName,
        List<SheetProfile> sheets
) {
    public record SheetProfile(
            String sheetName,
            int rowCount,
            int headerRowIndex,
            List<ColumnProfile> columnProfiles
    ) {
    }
}
