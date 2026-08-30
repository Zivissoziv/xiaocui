package com.xiaocui.followup.followup;

import java.time.LocalDateTime;

public record FollowupTask(
        long id,
        long sessionId,
        long followupItemId,
        String recipientId,
        String channel,
        String messageDraft,
        String messageFinal,
        String status,
        LocalDateTime scheduledAt,
        LocalDateTime sentAt,
        LocalDateTime closedAt
) {
    public FollowupTask withMessage(String message) {
        return new FollowupTask(id, sessionId, followupItemId, recipientId, channel, messageDraft, message, status, scheduledAt, sentAt, closedAt);
    }

    public FollowupTask sentNow() {
        return new FollowupTask(id, sessionId, followupItemId, recipientId, channel, messageDraft, messageFinal, "sent", scheduledAt, LocalDateTime.now(), closedAt);
    }

    public FollowupTask withStatus(String nextStatus) {
        return new FollowupTask(id, sessionId, followupItemId, recipientId, channel, messageDraft, messageFinal, nextStatus, scheduledAt, sentAt, closedAt);
    }

    /** 对应事项已补充完整，关闭任务但保留发送历史。 */
    public FollowupTask closeNow() {
        return new FollowupTask(id, sessionId, followupItemId, recipientId, channel, messageDraft, messageFinal, "closed", scheduledAt, sentAt, LocalDateTime.now());
    }

    public FollowupTask withMessages(String nextDraft, String nextFinal) {
        return new FollowupTask(id, sessionId, followupItemId, recipientId, channel, nextDraft, nextFinal, status, scheduledAt, sentAt, closedAt);
    }
}
