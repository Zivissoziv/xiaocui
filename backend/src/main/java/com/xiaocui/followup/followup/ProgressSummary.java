package com.xiaocui.followup.followup;

public record ProgressSummary(
        int total,
        int readyToSend,
        int sent,
        int resolved,
        int needsManualReview,
        int completion
) {
}
