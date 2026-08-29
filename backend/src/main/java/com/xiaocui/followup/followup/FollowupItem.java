package com.xiaocui.followup.followup;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public record FollowupItem(
        long id,
        long sessionId,
        long contactMatchId,
        String employeeId,
        String displayName,
        String departmentId,
        String email,
        String phone,
        List<Integer> sourceRows,
        List<String> missingFields,
        Map<String, String> filledFieldsSnapshot,
        String businessSummary,
        String issueSummary,
        String status,
        String dueAt,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public FollowupItem withStatus(String nextStatus) {
        return new FollowupItem(id, sessionId, contactMatchId, employeeId, displayName, departmentId, email, phone, sourceRows, missingFields, filledFieldsSnapshot, businessSummary, issueSummary, nextStatus, dueAt, createdAt, LocalDateTime.now());
    }

    /** 重新上传表格后，用最新的缺项情况刷新同一条待补充事项。 */
    public FollowupItem withReconcile(List<Integer> nextSourceRows,
                                      List<String> nextMissingFields,
                                      Map<String, String> nextFilledFields,
                                      String nextBusinessSummary,
                                      String nextIssueSummary) {
        return new FollowupItem(id, sessionId, contactMatchId, employeeId, displayName, departmentId, email, phone,
                nextSourceRows, nextMissingFields, nextFilledFields, nextBusinessSummary, nextIssueSummary,
                status, dueAt, createdAt, LocalDateTime.now());
    }
}
