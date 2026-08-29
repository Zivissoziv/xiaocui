package com.xiaocui.followup.sender;

import com.xiaocui.followup.followup.FollowupTask;

public interface MessageSender {
    ReminderEvent send(long sessionId, FollowupTask task);
}
