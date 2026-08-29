package com.xiaocui.followup.session;

import java.time.LocalDateTime;

/**
 * 数据库行对象。MyBatis 直接读写这里的字段，嵌套结构统一以 JSON 字符串落库。
 */
public final class SessionRows {
    private SessionRows() {
    }

    public static class SessionRow {
        public long id;
        public String title;
        public String ownerId;
        public String sourceType;
        public String sourceRef;
        public String userInstruction;
        public String dueAt;
        public String status;
        public LocalDateTime createdAt;
        public LocalDateTime updatedAt;
    }

    public static class SnapshotRow {
        public long id;
        public long sessionId;
        public String fileName;
        public String localFilePath;
        public String fileHash;
        public LocalDateTime downloadedAt;
        public LocalDateTime parsedAt;
        public int rowCount;
        public String profileJson;
    }

    public static class AnalysisRow {
        public long id;
        public long sessionId;
        public long sheetSnapshotId;
        public String tableSummary;
        public String worksheetName;
        public int headerRowIndex;
        public String inferredColumnsJson;
        public String risksJson;
        public String rawOutputJson;
        public LocalDateTime createdAt;
    }

    public static class ItemRow {
        public long id;
        public long sessionId;
        public long contactMatchId;
        public String employeeId;
        public String displayName;
        public String departmentId;
        public String email;
        public String phone;
        public String sourceRowsJson;
        public String missingFieldsJson;
        public String filledFieldsSnapshotJson;
        public String businessSummary;
        public String issueSummary;
        public String status;
        public String dueAt;
        public LocalDateTime createdAt;
        public LocalDateTime updatedAt;
    }

    public static class TaskRow {
        public long id;
        public long sessionId;
        public long followupItemId;
        public String recipientId;
        public String channel;
        public String messageDraft;
        public String messageFinal;
        public String status;
        public LocalDateTime scheduledAt;
        public LocalDateTime sentAt;
        public LocalDateTime closedAt;
    }

    public static class EventRow {
        public long id;
        public long sessionId;
        public long followupTaskId;
        public String channel;
        public String recipientId;
        public String messageSnapshot;
        public String status;
        public LocalDateTime sentAt;
        public String failedReason;
    }
}
