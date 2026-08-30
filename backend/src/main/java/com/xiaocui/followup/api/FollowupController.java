package com.xiaocui.followup.api;

import com.xiaocui.followup.followup.FollowupService;
import com.xiaocui.followup.followup.ReconcilePreview;
import com.xiaocui.followup.followup.SendRequest;
import com.xiaocui.followup.followup.SessionDetail;
import com.xiaocui.followup.followup.UpdateFollowupItemRequest;
import com.xiaocui.followup.sender.ReminderEvent;
import com.xiaocui.followup.session.AnalysisSession;
import com.xiaocui.followup.session.SessionRepository;
import com.xiaocui.followup.session.SessionService;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.MediaType;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@Validated
@RestController
@CrossOrigin(originPatterns = { "http://localhost:*", "http://127.0.0.1:*" })
@RequestMapping("/api")
public class FollowupController {
    private final SessionService sessionService;
    private final FollowupService followupService;
    private final SessionRepository repository;

    public FollowupController(SessionService sessionService, FollowupService followupService, SessionRepository repository) {
        this.sessionService = sessionService;
        this.followupService = followupService;
        this.repository = repository;
    }

    @GetMapping("/analysis-sessions")
    public List<AnalysisSession> listSessions() {
        return sessionService.list();
    }

    @GetMapping("/analysis-sessions/details")
    public List<SessionDetail> listSessionDetails() {
        return sessionService.list().stream()
                .map(session -> followupService.detail(session.id()))
                .toList();
    }

    @PostMapping(value = "/analysis-sessions", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public SessionDetail createSession(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "title", required = false) String title,
            @RequestParam("instruction") @NotBlank String instruction,
            @RequestParam(value = "dueAt", required = false) String dueAt
    ) {
        return sessionService.createAndAnalyze(file, title, instruction, dueAt);
    }

    @GetMapping("/analysis-sessions/{sessionId}")
    public SessionDetail getSession(@PathVariable long sessionId) {
        return sessionService.detail(sessionId);
    }

    @DeleteMapping("/analysis-sessions/{sessionId}")
    public void deleteSession(@PathVariable long sessionId) {
        repository.findSession(sessionId).orElseThrow(() -> new IllegalArgumentException("会话不存在"));
        repository.deleteSession(sessionId);
    }

    @GetMapping("/analysis-sessions/{sessionId}/analysis")
    public Object getAnalysis(@PathVariable long sessionId) {
        return repository.getAnalysis(sessionId);
    }

    @GetMapping("/analysis-sessions/{sessionId}/followup-items")
    public Object getFollowupItems(@PathVariable long sessionId) {
        return repository.getItems(sessionId);
    }

    @PatchMapping("/followup-items/{itemId}")
    public SessionDetail updateItem(@PathVariable long itemId, @RequestBody UpdateFollowupItemRequest request) {
        return followupService.updateItem(itemId, request);
    }

    @DeleteMapping("/followup-items/{itemId}")
    public SessionDetail deleteItem(@PathVariable long itemId) {
        return followupService.deleteItem(itemId);
    }

    @PostMapping("/analysis-sessions/{sessionId}/followup-tasks/send")
    public SessionDetail send(@PathVariable long sessionId, @RequestBody(required = false) SendRequest request) {
        return followupService.send(sessionId, request == null ? new SendRequest(List.of()) : request);
    }

    @PostMapping(value = "/analysis-sessions/{sessionId}/refresh", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public SessionDetail refresh(@PathVariable long sessionId, @RequestParam("file") MultipartFile file) {
        return sessionService.refresh(sessionId, file);
    }

    @PostMapping(value = "/analysis-sessions/{sessionId}/refresh-preview", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ReconcilePreview refreshPreview(@PathVariable long sessionId, @RequestParam("file") MultipartFile file) {
        return sessionService.previewRefresh(sessionId, file);
    }

    @PostMapping("/analysis-sessions/{sessionId}/refresh/confirm")
    public SessionDetail confirmRefresh(@PathVariable long sessionId) {
        return sessionService.confirmRefresh(sessionId);
    }

    @GetMapping("/analysis-sessions/{sessionId}/reminder-events")
    public List<ReminderEvent> events(@PathVariable long sessionId) {
        return repository.getEvents(sessionId);
    }
}
