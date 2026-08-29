package com.xiaocui.followup.aianalysis;

import java.util.List;
import java.util.Map;

public record FollowupDraft(
        String ownerRaw,
        String employeeHint,
        String departmentHint,
        String emailHint,
        String phoneHint,
        List<Integer> sourceRows,
        List<String> missingFields,
        Map<String, String> filledFields,
        String businessSummary,
        String issueSummary,
        String messageDraft
) {
    public FollowupDraft withMessage(String nextMessage) {
        return new FollowupDraft(ownerRaw, employeeHint, departmentHint, emailHint, phoneHint,
                sourceRows, missingFields, filledFields, businessSummary, issueSummary, nextMessage);
    }
}
