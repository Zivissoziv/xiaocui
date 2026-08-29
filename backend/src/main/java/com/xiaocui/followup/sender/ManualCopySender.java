package com.xiaocui.followup.sender;

import com.xiaocui.followup.followup.FollowupTask;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
public class ManualCopySender implements MessageSender {
    @Override
    public ReminderEvent send(long sessionId, FollowupTask task) {
        return new ReminderEvent(
                0L,
                sessionId,
                task.id(),
                "manual",
                task.recipientId(),
                task.messageFinal(),
                "sent",
                LocalDateTime.now(),
                ""
        );
    }
}
