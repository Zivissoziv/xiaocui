package com.xiaocui.followup.session;

import com.xiaocui.followup.aianalysis.AiAnalysisResult;
import com.xiaocui.followup.followup.FollowupItem;
import com.xiaocui.followup.followup.FollowupTask;
import com.xiaocui.followup.sender.ReminderEvent;
import com.xiaocui.followup.support.JsonCodec;
import com.xiaocui.followup.tableprofile.WorkbookProfile;
import com.xiaocui.followup.workbook.WorkbookSnapshot;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Repository
public class MyBatisSessionRepository implements SessionRepository {
    private static final String COUNTER = "global";
    private static final long COUNTER_START = 1000L;

    private final SessionMapper mapper;
    private final JsonCodec codec;

    public MyBatisSessionRepository(SessionMapper mapper, JsonCodec codec) {
        this.mapper = mapper;
        this.codec = codec;
    }

    @Override
    public synchronized long nextId() {
        Long current = mapper.selectCounter(COUNTER);
        if (current == null) {
            mapper.insertCounter(COUNTER, COUNTER_START);
            return COUNTER_START;
        }
        mapper.bumpCounter(COUNTER);
        return current + 1;
    }

    @Override
    @Transactional
    public void saveSession(AnalysisSession session) {
        if (mapper.selectSession(session.id()) == null) {
            mapper.insertSession(toRow(session));
        } else {
            mapper.updateSession(toRow(session));
        }
    }

    @Override
    public List<AnalysisSession> findSessions() {
        List<AnalysisSession> sessions = new ArrayList<>();
        for (SessionRows.SessionRow row : mapper.selectAllSessions()) {
            sessions.add(fromRow(row));
        }
        return sessions;
    }

    @Override
    public Optional<AnalysisSession> findSession(long id) {
        return Optional.ofNullable(mapper.selectSession(id)).map(this::fromRow);
    }

    @Override
    @Transactional
    public void saveAnalysis(long sessionId, WorkbookSnapshot snapshot, WorkbookProfile profile, AiAnalysisResult analysis) {
        long snapshotId = nextId();

        SessionRows.SnapshotRow snapshotRow = new SessionRows.SnapshotRow();
        snapshotRow.id = snapshotId;
        snapshotRow.sessionId = sessionId;
        snapshotRow.fileName = snapshot.fileName();
        snapshotRow.localFilePath = snapshot.localFilePath();
        snapshotRow.fileHash = snapshot.fileHash();
        snapshotRow.downloadedAt = snapshot.downloadedAt();
        snapshotRow.parsedAt = snapshot.parsedAt();
        snapshotRow.rowCount = snapshot.sheets().stream().mapToInt(sheet -> sheet.rows().size()).sum();
        snapshotRow.profileJson = codec.write(profile);
        mapper.insertSnapshot(snapshotRow);

        SessionRows.AnalysisRow analysisRow = new SessionRows.AnalysisRow();
        analysisRow.id = nextId();
        analysisRow.sessionId = sessionId;
        analysisRow.sheetSnapshotId = snapshotId;
        analysisRow.tableSummary = analysis.tableSummary();
        analysisRow.worksheetName = analysis.columnPlan() == null ? "" : empty(analysis.columnPlan().sheetName());
        analysisRow.headerRowIndex = profile.sheets().isEmpty() ? 1 : profile.sheets().get(0).headerRowIndex();
        analysisRow.inferredColumnsJson = codec.write(analysis.columnPlan());
        analysisRow.risksJson = codec.write(analysis.risks());
        analysisRow.rawOutputJson = codec.write(analysis);
        analysisRow.createdAt = LocalDateTime.now();
        mapper.insertAnalysis(analysisRow);
    }

    @Override
    public WorkbookProfile getProfile(long sessionId) {
        SessionRows.SnapshotRow row = mapper.selectLatestSnapshot(sessionId);
        if (row == null) return new WorkbookProfile("", List.of());
        return codec.read(row.profileJson, WorkbookProfile.class, new WorkbookProfile(row.fileName, List.of()));
    }

    @Override
    public AiAnalysisResult getAnalysis(long sessionId) {
        SessionRows.AnalysisRow row = mapper.selectLatestAnalysis(sessionId);
        if (row == null) return null;
        return codec.read(row.rawOutputJson, AiAnalysisResult.class);
    }

    @Override
    @Transactional
    public void saveItems(long sessionId, List<FollowupItem> items, List<FollowupTask> tasks) {
        mapper.deleteTasks(sessionId);
        mapper.deleteItems(sessionId);
        for (FollowupItem item : items) {
            mapper.insertItem(toRow(item));
        }
        for (FollowupTask task : tasks) {
            mapper.insertTask(toRow(task));
        }
    }

    @Override
    @Transactional
    public void insertItem(FollowupItem item) {
        mapper.insertItem(toRow(item));
    }

    @Override
    @Transactional
    public void insertTask(FollowupTask task) {
        mapper.insertTask(toRow(task));
    }

    @Override
    public List<FollowupItem> getItems(long sessionId) {
        List<FollowupItem> items = new ArrayList<>();
        for (SessionRows.ItemRow row : mapper.selectItems(sessionId)) {
            items.add(fromRow(row));
        }
        return items;
    }

    @Override
    public List<FollowupTask> getTasks(long sessionId) {
        List<FollowupTask> tasks = new ArrayList<>();
        for (SessionRows.TaskRow row : mapper.selectTasks(sessionId)) {
            tasks.add(fromRow(row));
        }
        return tasks;
    }

    @Override
    @Transactional
    public void replaceItem(FollowupItem item) {
        mapper.updateItem(toRow(item));
    }

    @Override
    @Transactional
    public void replaceTask(FollowupTask task) {
        mapper.updateTask(toRow(task));
    }

    @Override
    @Transactional
    public void deleteSession(long sessionId) {
        mapper.deleteEvents(sessionId);
        mapper.deleteTasks(sessionId);
        mapper.deleteItems(sessionId);
        mapper.deleteContactMatches(sessionId);
        mapper.deleteAnalyses(sessionId);
        mapper.deleteSnapshots(sessionId);
        mapper.deleteSession(sessionId);
    }

    @Override
    @Transactional
    public void deleteItem(long sessionId, long itemId) {
        SessionRows.TaskRow task = mapper.selectTaskByItem(sessionId, itemId);
        if (task != null) {
            mapper.deleteEventsByTask(task.id);
        }
        mapper.deleteTaskByItem(itemId);
        SessionRows.ItemRow item = mapper.selectItem(itemId);
        if (item != null && item.contactMatchId > 0) {
            mapper.deleteContactMatch(item.contactMatchId);
        }
        mapper.deleteItemById(itemId);
    }

    @Override
    @Transactional
    public void addEvent(ReminderEvent event) {
        mapper.insertEvent(toRow(event));
    }

    @Override
    public List<ReminderEvent> getEvents(long sessionId) {
        List<ReminderEvent> events = new ArrayList<>();
        for (SessionRows.EventRow row : mapper.selectEvents(sessionId)) {
            events.add(fromRow(row));
        }
        return events;
    }

    @Override
    public Optional<FollowupItem> findItem(long itemId) {
        return Optional.ofNullable(mapper.selectItem(itemId)).map(this::fromRow);
    }

    @Override
    public Optional<FollowupTask> findTaskByItem(long sessionId, long itemId) {
        return Optional.ofNullable(mapper.selectTaskByItem(sessionId, itemId)).map(this::fromRow);
    }

    private SessionRows.SessionRow toRow(AnalysisSession session) {
        SessionRows.SessionRow row = new SessionRows.SessionRow();
        row.id = session.id();
        row.title = session.title();
        row.ownerId = session.ownerId();
        row.sourceType = session.sourceType();
        row.sourceRef = session.sourceRef();
        row.userInstruction = session.userInstruction();
        row.dueAt = session.dueAt();
        row.status = session.status();
        row.createdAt = session.createdAt();
        row.updatedAt = session.updatedAt();
        return row;
    }

    private AnalysisSession fromRow(SessionRows.SessionRow row) {
        return new AnalysisSession(
                row.id, row.title, row.ownerId, row.sourceType, row.sourceRef,
                row.userInstruction, row.dueAt, row.status, row.createdAt, row.updatedAt
        );
    }

    private SessionRows.ItemRow toRow(FollowupItem item) {
        SessionRows.ItemRow row = new SessionRows.ItemRow();
        row.id = item.id();
        row.sessionId = item.sessionId();
        row.contactMatchId = item.contactMatchId();
        row.employeeId = item.employeeId();
        row.displayName = item.displayName();
        row.departmentId = item.departmentId();
        row.email = item.email();
        row.phone = item.phone();
        row.sourceRowsJson = codec.write(item.sourceRows());
        row.missingFieldsJson = codec.write(item.missingFields());
        row.filledFieldsSnapshotJson = codec.write(item.filledFieldsSnapshot());
        row.businessSummary = item.businessSummary();
        row.issueSummary = item.issueSummary();
        row.status = item.status();
        row.dueAt = item.dueAt();
        row.createdAt = item.createdAt();
        row.updatedAt = item.updatedAt();
        return row;
    }

    private FollowupItem fromRow(SessionRows.ItemRow row) {
        return new FollowupItem(
                row.id, row.sessionId, row.contactMatchId, row.employeeId, row.displayName,
                row.departmentId, row.email, row.phone,
                codec.readIntegers(row.sourceRowsJson),
                codec.readStrings(row.missingFieldsJson),
                codec.readStringMap(row.filledFieldsSnapshotJson),
                row.businessSummary, row.issueSummary, row.status, row.dueAt,
                row.createdAt, row.updatedAt
        );
    }

    private SessionRows.TaskRow toRow(FollowupTask task) {
        SessionRows.TaskRow row = new SessionRows.TaskRow();
        row.id = task.id();
        row.sessionId = task.sessionId();
        row.followupItemId = task.followupItemId();
        row.recipientId = task.recipientId();
        row.channel = task.channel();
        row.messageDraft = task.messageDraft();
        row.messageFinal = task.messageFinal();
        row.status = task.status();
        row.scheduledAt = task.scheduledAt();
        row.sentAt = task.sentAt();
        row.closedAt = task.closedAt();
        return row;
    }

    private FollowupTask fromRow(SessionRows.TaskRow row) {
        return new FollowupTask(
                row.id, row.sessionId, row.followupItemId, row.recipientId, row.channel,
                row.messageDraft, row.messageFinal, row.status,
                row.scheduledAt, row.sentAt, row.closedAt
        );
    }

    private SessionRows.EventRow toRow(ReminderEvent event) {
        SessionRows.EventRow row = new SessionRows.EventRow();
        row.id = event.id();
        row.sessionId = event.sessionId();
        row.followupTaskId = event.followupTaskId();
        row.channel = event.channel();
        row.recipientId = event.recipientId();
        row.messageSnapshot = event.messageSnapshot();
        row.status = event.status();
        row.sentAt = event.sentAt();
        row.failedReason = event.failedReason();
        return row;
    }

    private ReminderEvent fromRow(SessionRows.EventRow row) {
        return new ReminderEvent(
                row.id, row.sessionId, row.followupTaskId, row.channel, row.recipientId,
                row.messageSnapshot, row.status, row.sentAt, row.failedReason
        );
    }

    private String empty(String value) {
        return value == null ? "" : value;
    }
}
