package com.xiaocui.followup.aianalysis;

import com.xiaocui.followup.tableprofile.WorkbookProfile;
import com.xiaocui.followup.workbook.WorkbookSnapshot;

import java.util.List;

public interface AiAnalysisService {
    AiAnalysisResult analyze(WorkbookSnapshot snapshot, WorkbookProfile profile, String userInstruction, String dueAt);

    /**
     * 只重生成催办文案，不重新读表、不改缺项判定。
     * 实现类不支持时返回 false，由调用方回退到模板文案。
     */
    default boolean regenerateMessages(List<FollowupDraft> drafts, String userInstruction, String dueAt, List<String> risks) {
        return false;
    }
}
