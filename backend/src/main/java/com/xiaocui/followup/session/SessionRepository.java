package com.xiaocui.followup.session;

import com.xiaocui.followup.aianalysis.AiAnalysisResult;
import com.xiaocui.followup.followup.FollowupItem;
import com.xiaocui.followup.followup.FollowupTask;
import com.xiaocui.followup.sender.ReminderEvent;
import com.xiaocui.followup.tableprofile.WorkbookProfile;
import com.xiaocui.followup.workbook.WorkbookSnapshot;

import java.util.List;
import java.util.Optional;

/**
 * 一次催办会话相关的全部读写。
 * 上层 SessionService / FollowupService 只依赖这个接口，不感知底层是内存还是数据库。
 */
public interface SessionRepository {

    void saveSession(AnalysisSession session);

    List<AnalysisSession> findSessions();

    Optional<AnalysisSession> findSession(long id);

    void saveAnalysis(long sessionId, WorkbookSnapshot snapshot, WorkbookProfile profile, AiAnalysisResult analysis);

    WorkbookProfile getProfile(long sessionId);

    AiAnalysisResult getAnalysis(long sessionId);

    /** 全量替换某个会话下的待补充事项与催办任务。仅用于首次生成。 */
    void saveItems(long sessionId, List<FollowupItem> items, List<FollowupTask> tasks);

    /** 追加单条待补充事项，用于刷新时发现的新缺项。 */
    void insertItem(FollowupItem item);

    /** 追加单条催办任务，用于刷新时发现的新缺项。 */
    void insertTask(FollowupTask task);

    List<FollowupItem> getItems(long sessionId);

    List<FollowupTask> getTasks(long sessionId);

    void replaceItem(FollowupItem item);

    void replaceTask(FollowupTask task);

    void addEvent(ReminderEvent event);

    List<ReminderEvent> getEvents(long sessionId);

    long nextId();

    Optional<FollowupItem> findItem(long itemId);

    Optional<FollowupTask> findTaskByItem(long sessionId, long itemId);

    /** 删除整个催办会话及其全部关联数据（事项、任务、留痕、快照、分析记录）。 */
    void deleteSession(long sessionId);

    /** 删除单个待补充事项及其催办任务、发送留痕、联系匹配记录。 */
    void deleteItem(long sessionId, long itemId);
}
