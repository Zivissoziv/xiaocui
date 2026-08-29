package com.xiaocui.followup.aianalysis;

import java.util.List;

public record AiAnalysisResult(
        String tableSummary,
        ColumnPlan columnPlan,
        List<FollowupDraft> followupItems,
        List<String> risks
) {
}
