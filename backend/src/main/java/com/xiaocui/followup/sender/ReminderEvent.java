package com.xiaocui.followup.sender;

import java.time.LocalDateTime;

public record ReminderEvent(
        long id,
        long sessionId,
        long followupTaskId,
        String channel,
        String recipientId,
        String messageSnapshot,
        String status,
        LocalDateTime sentAt,
        String failedReason
) {
    public ReminderEvent withId(long nextId) {
        return new ReminderEvent(nextId, sessionId, followupTaskId, channel, recipientId, messageSnapshot, status, sentAt, failedReason);
    }
}
