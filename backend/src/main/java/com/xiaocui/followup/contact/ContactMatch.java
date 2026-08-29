package com.xiaocui.followup.contact;

public record ContactMatch(
        String rawContactText,
        String employeeId,
        String displayName,
        String departmentId,
        String email,
        String phone,
        String matchStatus
) {
}
