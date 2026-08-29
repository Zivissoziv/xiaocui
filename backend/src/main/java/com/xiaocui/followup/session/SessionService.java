package com.xiaocui.followup.session;

import com.xiaocui.followup.aianalysis.AiAnalysisResult;
import com.xiaocui.followup.aianalysis.AiAnalysisService;
import com.xiaocui.followup.followup.FollowupService;
import com.xiaocui.followup.followup.ReconcilePreview;
import com.xiaocui.followup.followup.SessionDetail;
import com.xiaocui.followup.tableprofile.TableProfiler;
import com.xiaocui.followup.tableprofile.WorkbookProfile;
import com.xiaocui.followup.workbook.WorkbookParser;
import com.xiaocui.followup.workbook.WorkbookSnapshot;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class SessionService {
    private final WorkbookParser workbookParser;
    private final TableProfiler tableProfiler;
    private final AiAnalysisService aiAnalysisService;
    private final FollowupService followupService;
    private final SessionRepository repository;

    /** 预览阶段分析结果缓存：确认更新时直接复用，避免重复调用模型。 */
    private final Map<Long, CachedAnalysis> pendingRefreshes = new ConcurrentHashMap<>();

    private record CachedAnalysis(WorkbookSnapshot snapshot, WorkbookProfile profile, AiAnalysisResult analysis) {
    }

    public SessionService(
            WorkbookParser workbookParser,
            TableProfiler tableProfiler,
            AiAnalysisService aiAnalysisService,
            FollowupService followupService,
            SessionRepository repository
    ) {
        this.workbookParser = workbookParser;
        this.tableProfiler = tableProfiler;
        this.aiAnalysisService = aiAnalysisService;
        this.followupService = followupService;
        this.repository = repository;
    }

    public SessionDetail createAndAnalyze(MultipartFile file, String title, String instruction, String dueAt) {
        long id = repository.nextId();
        AnalysisSession session = new AnalysisSession(
                id,
                isBlank(title) ? stripExtension(file.getOriginalFilename()) : title,
                "current-user",
                "excel_upload",
                "",
                instruction,
                dueAt,
                "analyzing",
                LocalDateTime.now(),
                LocalDateTime.now()
        );
        repository.saveSession(session);

        WorkbookSnapshot snapshot = workbookParser.parse(file);
        WorkbookProfile profile = tableProfiler.profile(snapshot);
        AiAnalysisResult analysis = aiAnalysisService.analyze(snapshot, profile, instruction, dueAt);
        repository.saveAnalysis(id, snapshot, profile, analysis);
        followupService.generate(id, analysis, dueAt);
        repository.saveSession(session.withSourceRef(snapshot.localFilePath()).withStatus("pending_confirmation"));
        return followupService.detail(id);
    }

    public SessionDetail refresh(long sessionId, MultipartFile file) {
        AnalysisSession session = repository.findSession(sessionId).orElseThrow(() -> new IllegalArgumentException("会话不存在"));
        repository.saveSession(session.withStatus("refreshing"));
        WorkbookSnapshot snapshot = workbookParser.parse(file);
        WorkbookProfile profile = tableProfiler.profile(snapshot);
        AiAnalysisResult analysis = aiAnalysisService.analyze(snapshot, profile, session.userInstruction(), session.dueAt());
        repository.saveAnalysis(sessionId, snapshot, profile, analysis);
        followupService.reconcile(sessionId, analysis, session.dueAt());
        repository.saveSession(session.withSourceRef(snapshot.localFilePath()).withStatus("pending_confirmation"));
        return followupService.detail(sessionId);
    }

    /** 刷新前的差异预览：解析并分析新文件，但与当前数据只做比对，不落库。分析结果缓存，供确认时复用。 */
    public ReconcilePreview previewRefresh(long sessionId, MultipartFile file) {
        AnalysisSession session = repository.findSession(sessionId).orElseThrow(() -> new IllegalArgumentException("会话不存在"));
        WorkbookSnapshot snapshot = workbookParser.parse(file);
        WorkbookProfile profile = tableProfiler.profile(snapshot);
        AiAnalysisResult analysis = aiAnalysisService.analyze(snapshot, profile, session.userInstruction(), session.dueAt());
        pendingRefreshes.put(sessionId, new CachedAnalysis(snapshot, profile, analysis));
        return followupService.previewReconcile(sessionId, analysis);
    }

    /**
     * 确认应用预览：直接复用预览阶段已分析好的结果执行对账，不再重新解析和调用模型。
     * 预览缓存不存在时（重启/超时/未预览）抛错，提示用户重新上传。
     */
    public SessionDetail confirmRefresh(long sessionId) {
        AnalysisSession session = repository.findSession(sessionId).orElseThrow(() -> new IllegalArgumentException("会话不存在"));
        CachedAnalysis cached = pendingRefreshes.remove(sessionId);
        if (cached == null) {
            throw new IllegalArgumentException("预览已失效，请重新上传最新版文件");
        }
        repository.saveSession(session.withStatus("refreshing"));
        repository.saveAnalysis(sessionId, cached.snapshot(), cached.profile(), cached.analysis());
        followupService.reconcile(sessionId, cached.analysis(), session.dueAt());
        repository.saveSession(session.withSourceRef(cached.snapshot().localFilePath()).withStatus("pending_confirmation"));
        return followupService.detail(sessionId);
    }

    public List<AnalysisSession> list() {
        return repository.findSessions();
    }

    public SessionDetail detail(long sessionId) {
        return followupService.detail(sessionId);
    }

    private String stripExtension(String fileName) {
        if (fileName == null || fileName.isBlank()) return "新的催办任务";
        return fileName.replaceFirst("\\.(xlsx|xls)$", "");
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
