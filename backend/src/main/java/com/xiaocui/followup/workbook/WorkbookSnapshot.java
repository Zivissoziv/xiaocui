package com.xiaocui.followup.workbook;

import java.time.LocalDateTime;
import java.util.List;

public record WorkbookSnapshot(
        long id,
        String fileName,
        String localFilePath,
        String fileHash,
        LocalDateTime downloadedAt,
        LocalDateTime parsedAt,
        List<SheetData> sheets
) {
}
