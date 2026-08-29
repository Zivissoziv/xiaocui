package com.xiaocui.followup.followup;

import com.xiaocui.followup.aianalysis.AiAnalysisResult;
import com.xiaocui.followup.sender.ReminderEvent;
import com.xiaocui.followup.session.AnalysisSession;
import com.xiaocui.followup.tableprofile.WorkbookProfile;

import java.util.List;

public record SessionDetail(
        AnalysisSession session,
        WorkbookProfile workbookProfile,
        AiAnalysisResult analysis,
        List<FollowupItem> items,
        List<FollowupTask> tasks,
        List<ReminderEvent> reminderEvents,
        ProgressSummary progress
) {
}
