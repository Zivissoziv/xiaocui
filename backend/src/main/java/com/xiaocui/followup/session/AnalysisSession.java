package com.xiaocui.followup.session;

import java.time.LocalDateTime;

public record AnalysisSession(
        long id,
        String title,
        String ownerId,
        String sourceType,
        String sourceRef,
        String userInstruction,
        String dueAt,
        String status,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public AnalysisSession withStatus(String nextStatus) {
        return new AnalysisSession(id, title, ownerId, sourceType, sourceRef, userInstruction, dueAt, nextStatus, createdAt, LocalDateTime.now());
    }

    public AnalysisSession withSourceRef(String nextSourceRef) {
        return new AnalysisSession(id, title, ownerId, sourceType, nextSourceRef, userInstruction, dueAt, status, createdAt, LocalDateTime.now());
    }

    public AnalysisSession withTitleAndDueAt(String nextTitle, String nextDueAt) {
        return new AnalysisSession(id, nextTitle, ownerId, sourceType, sourceRef, userInstruction, nextDueAt, status, createdAt, LocalDateTime.now());
    }
}
