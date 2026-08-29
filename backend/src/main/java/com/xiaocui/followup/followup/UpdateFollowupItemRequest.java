package com.xiaocui.followup.followup;

public record UpdateFollowupItemRequest(
        String displayName,
        String employeeId,
        String departmentId,
        String email,
        String phone,
        String status,
        String messageFinal
) {
}
