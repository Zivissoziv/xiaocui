package com.xiaocui.followup.followup;

import com.xiaocui.followup.aianalysis.AiAnalysisResult;
import com.xiaocui.followup.aianalysis.FollowupDraft;
import com.xiaocui.followup.contact.ContactMatch;
import com.xiaocui.followup.contact.ContactService;
import com.xiaocui.followup.sender.MessageSender;
import com.xiaocui.followup.sender.ReminderEvent;
import com.xiaocui.followup.session.AnalysisSession;
import com.xiaocui.followup.session.SessionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class FollowupService {
    private final ContactService contactService;
    private final MessageSender sender;
    private final SessionRepository repository;

    public FollowupService(ContactService contactService, MessageSender sender, SessionRepository repository) {
        this.contactService = contactService;
        this.sender = sender;
        this.repository = repository;
    }

    @Transactional
    public void generate(long sessionId, AiAnalysisResult analysis, String dueAt) {
        List<FollowupItem> items = new ArrayList<>();
        List<FollowupTask> tasks = new ArrayList<>();
        for (FollowupDraft draft : analysis.followupItems()) {
            ContactMatch match = contactService.match(draft);
            FollowupItem item = buildItem(sessionId, draft, match, dueAt);
            items.add(item);
            tasks.add(buildTask(sessionId, item, match, draft));
        }
        repository.saveItems(sessionId, items, tasks);
    }

    /**
     * 重新上传表格后的增量对账。
     * 已补充完整的关闭任务，仍缺失的刷新缺项摘要，新出现的补建任务，绝不覆盖已有的发送留痕。
     */
    @Transactional
    public void reconcile(long sessionId, AiAnalysisResult analysis, String dueAt) {
        Map<String, FollowupItem> existingByOwner = new LinkedHashMap<>();
        for (FollowupItem item : repository.getItems(sessionId)) {
            existingByOwner.putIfAbsent(item.displayName(), item);
        }

        Set<String> stillMissing = new LinkedHashSet<>();
        for (FollowupDraft draft : analysis.followupItems()) {
            stillMissing.add(draft.ownerRaw());
            FollowupItem current = existingByOwner.get(draft.ownerRaw());

            if (current == null) {
                ContactMatch match = contactService.match(draft);
                FollowupItem created = buildItem(sessionId, draft, match, dueAt);
                repository.insertItem(created);
                repository.insertTask(buildTask(sessionId, created, match, draft));
                continue;
            }

            if ("resolved".equals(current.status())) continue;

            repository.replaceItem(current.withReconcile(
                    draft.sourceRows(),
                    draft.missingFields(),
                    draft.filledFields(),
                    draft.businessSummary(),
                    draft.issueSummary()
            ));

            repository.findTaskByItem(sessionId, current.id()).ifPresent(task -> {
                boolean settled = "sent".equals(task.status()) || "closed".equals(task.status()) || "blocked".equals(task.status());
                if (!settled) {
                    repository.replaceTask(task.withMessages(draft.messageDraft(), draft.messageDraft()));
                }
            });
        }

        for (FollowupItem item : existingByOwner.values()) {
            if (stillMissing.contains(item.displayName())) continue;
            if ("resolved".equals(item.status())) continue;
            repository.replaceItem(item.withReconcile(
                    item.sourceRows(),
                    List.of(),
                    item.filledFieldsSnapshot(),
                    item.businessSummary(),
                    "已补充完整"
            ).withStatus("resolved"));
            repository.findTaskByItem(sessionId, item.id()).ifPresent(task -> {
                if (!"closed".equals(task.status())) repository.replaceTask(task.closeNow());
            });
        }
    }

    /**
     * 对账预览：与 {@link #reconcile} 使用相同的比对规则，但只读不写库，
     * 返回新增/补齐/变化/无变化四类差异，供前端展示后由用户决定是否执行更新。
     */
    public ReconcilePreview previewReconcile(long sessionId, AiAnalysisResult analysis) {
        Map<String, FollowupItem> existingByOwner = new LinkedHashMap<>();
        for (FollowupItem item : repository.getItems(sessionId)) {
            existingByOwner.putIfAbsent(item.displayName(), item);
        }

        List<ReconcilePreview.RowDiff> added = new ArrayList<>();
        List<ReconcilePreview.RowDiff> updated = new ArrayList<>();
        Set<String> stillMissing = new LinkedHashSet<>();
        int unchanged = 0;

        for (FollowupDraft draft : analysis.followupItems()) {
            stillMissing.add(draft.ownerRaw());
            FollowupItem current = existingByOwner.get(draft.ownerRaw());
            if (current == null) {
                added.add(new ReconcilePreview.RowDiff(
                        draft.ownerRaw(), draft.missingFields(), List.of(), "新出现的待补充对象"));
                continue;
            }
            if ("resolved".equals(current.status())) continue;
            if (current.missingFields().equals(draft.missingFields())) {
                unchanged++;
            } else {
                updated.add(new ReconcilePreview.RowDiff(
                        draft.ownerRaw(), draft.missingFields(), current.missingFields(), "缺项内容有变化"));
            }
        }

        List<ReconcilePreview.RowDiff> resolved = new ArrayList<>();
        for (FollowupItem item : existingByOwner.values()) {
            if (stillMissing.contains(item.displayName())) continue;
            if ("resolved".equals(item.status())) continue;
            resolved.add(new ReconcilePreview.RowDiff(
                    item.displayName(), List.of(), item.missingFields(), "已补充完整，将标记完成"));
        }
        return new ReconcilePreview(added, resolved, updated, unchanged);
    }

    private FollowupItem buildItem(long sessionId, FollowupDraft draft, ContactMatch match, String dueAt) {
        String itemStatus = "needs_confirmation".equals(match.matchStatus()) ? "needs_manual_review" : "ready_to_send";
        return new FollowupItem(
                repository.nextId(),
                sessionId,
                repository.nextId(),
                match.employeeId(),
                match.displayName(),
                match.departmentId(),
                match.email(),
                match.phone(),
                draft.sourceRows(),
                draft.missingFields(),
                draft.filledFields(),
                draft.businessSummary(),
                draft.issueSummary(),
                itemStatus,
                dueAt,
                LocalDateTime.now(),
                LocalDateTime.now()
        );
    }

    private FollowupTask buildTask(long sessionId, FollowupItem item, ContactMatch match, FollowupDraft draft) {
        String recipient = match.employeeId();
        if (isBlank(recipient) || "待确认".equals(recipient)) {
            recipient = firstNonBlank(match.email(), match.phone());
        }
        return new FollowupTask(
                repository.nextId(),
                sessionId,
                item.id(),
                recipient,
                "manual",
                draft.messageDraft(),
                draft.messageDraft(),
                "ready_to_send".equals(item.status()) ? "draft" : "blocked",
                null,
                null,
                null
        );
    }

    public SessionDetail detail(long sessionId) {
        AnalysisSession session = repository.findSession(sessionId).orElseThrow(() -> new IllegalArgumentException("会话不存在"));
        List<FollowupItem> items = repository.getItems(sessionId);
        List<FollowupTask> tasks = repository.getTasks(sessionId);
        return new SessionDetail(
                session,
                repository.getProfile(sessionId),
                repository.getAnalysis(sessionId),
                items,
                tasks,
                repository.getEvents(sessionId),
                summarize(items, tasks)
        );
    }

    public SessionDetail updateItem(long itemId, UpdateFollowupItemRequest request) {
        FollowupItem item = findItem(itemId);
        FollowupTask task = findTaskByItem(item.sessionId(), itemId);
        String status = item.status();
        if (request.status() != null && !request.status().isBlank()) status = request.status();
        if ("needs_manual_review".equals(status) && hasContact(request)) status = "ready_to_send";
        FollowupItem nextItem = new FollowupItem(
                item.id(),
                item.sessionId(),
                item.contactMatchId(),
                firstNonBlank(request.employeeId(), item.employeeId()),
                firstNonBlank(request.displayName(), item.displayName()),
                firstNonBlank(request.departmentId(), item.departmentId()),
                firstNonBlank(request.email(), item.email()),
                firstNonBlank(request.phone(), item.phone()),
                item.sourceRows(),
                item.missingFields(),
                item.filledFieldsSnapshot(),
                item.businessSummary(),
                item.issueSummary(),
                status,
                item.dueAt(),
                item.createdAt(),
                LocalDateTime.now()
        );
        repository.replaceItem(nextItem);
        String message = firstNonBlank(request.messageFinal(), task.messageFinal());
        repository.replaceTask(task.withMessage(message));
        return detail(item.sessionId());
    }

    public SessionDetail send(long sessionId, SendRequest request) {
        LinkedHashSet<Long> selected = request.itemIds() == null ? new LinkedHashSet<>() : new LinkedHashSet<>(request.itemIds());
        for (FollowupTask task : repository.getTasks(sessionId)) {
            if (!selected.isEmpty() && !selected.contains(task.followupItemId())) continue;
            FollowupItem item = findItem(task.followupItemId());
            // 只允许有联系方式的待发送/已发送对象；异常（无联系方式）和已补充完整的不再发送。
            // 已发送过的允许再次催办，每次都会新增一条留痕。
            if (!item.status().equals("ready_to_send") && !item.status().equals("sent")) continue;
            FollowupTask sent = task.sentNow();
            repository.replaceTask(sent);
            repository.replaceItem(item.withStatus("sent"));
            ReminderEvent event = sender.send(sessionId, sent);
            repository.addEvent(event.withId(repository.nextId()));
        }
        return detail(sessionId);
    }

    private ProgressSummary summarize(List<FollowupItem> items, List<FollowupTask> tasks) {
        int total = items.size();
        int ready = (int) items.stream().filter(item -> item.status().equals("ready_to_send")).count();
        int manual = (int) items.stream().filter(item -> item.status().equals("needs_manual_review")).count();
        int resolved = (int) items.stream().filter(item -> item.status().equals("resolved")).count();
        int sent = (int) tasks.stream().filter(task -> task.status().equals("sent")).count();
        int completion = total == 0 ? 100 : Math.round((resolved + sent) * 100f / total);
        return new ProgressSummary(total, ready, sent, resolved, manual, completion);
    }

    private FollowupItem findItem(long itemId) {
        return repository.findItem(itemId).orElseThrow(() -> new IllegalArgumentException("待补充事项不存在"));
    }

    private FollowupTask findTaskByItem(long sessionId, long itemId) {
        return repository.findTaskByItem(sessionId, itemId).orElseThrow(() -> new IllegalArgumentException("催办任务不存在"));
    }

    private boolean hasContact(UpdateFollowupItemRequest request) {
        // 与 ContactService 的判断保持一致：邮箱或手机号即可，工号不算联系方式。
        return !isBlank(request.email()) || !isBlank(request.phone());
    }

    private String firstNonBlank(String next, String current) {
        return isBlank(next) ? current : next;
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
