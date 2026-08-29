package com.xiaocui.followup.aianalysis;

import com.xiaocui.followup.tableprofile.WorkbookProfile;
import com.xiaocui.followup.workbook.WorkbookSnapshot;

public interface AiAnalysisService {
    AiAnalysisResult analyze(WorkbookSnapshot snapshot, WorkbookProfile profile, String userInstruction, String dueAt);
}
