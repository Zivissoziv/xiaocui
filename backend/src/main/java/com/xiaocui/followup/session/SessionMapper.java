package com.xiaocui.followup.session;

import com.xiaocui.followup.session.SessionRows.AnalysisRow;
import com.xiaocui.followup.session.SessionRows.EventRow;
import com.xiaocui.followup.session.SessionRows.ItemRow;
import com.xiaocui.followup.session.SessionRows.SnapshotRow;
import com.xiaocui.followup.session.SessionRows.TaskRow;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.ResultType;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface SessionMapper {

    @Select("SELECT next_val FROM id_counter WHERE name = #{name}")
    @ResultType(Long.class)
    Long selectCounter(@Param("name") String name);

    @Insert("INSERT INTO id_counter(name, next_val) VALUES(#{name}, #{value})")
    void insertCounter(@Param("name") String name, @Param("value") long value);

    @Update("UPDATE id_counter SET next_val = next_val + 1 WHERE name = #{name}")
    void bumpCounter(@Param("name") String name);

    @Insert("""
            INSERT INTO analysis_sessions
              (id, title, owner_id, source_type, source_ref, user_instruction, due_at, status, created_at, updated_at)
            VALUES
              (#{id}, #{title}, #{ownerId}, #{sourceType}, #{sourceRef}, #{userInstruction}, #{dueAt}, #{status}, #{createdAt}, #{updatedAt})
            """)
    void insertSession(SessionRows.SessionRow row);

    @Update("""
            UPDATE analysis_sessions SET
              title = #{title},
              owner_id = #{ownerId},
              source_type = #{sourceType},
              source_ref = #{sourceRef},
              user_instruction = #{userInstruction},
              due_at = #{dueAt},
              status = #{status},
              created_at = #{createdAt},
              updated_at = #{updatedAt}
            WHERE id = #{id}
            """)
    void updateSession(SessionRows.SessionRow row);

    @Select("""
            SELECT id, title, owner_id, source_type, source_ref, user_instruction, due_at, status, created_at, updated_at
            FROM analysis_sessions
            ORDER BY updated_at DESC, id DESC
            """)
    @ResultType(SessionRows.SessionRow.class)
    List<SessionRows.SessionRow> selectAllSessions();

    @Select("""
            SELECT id, title, owner_id, source_type, source_ref, user_instruction, due_at, status, created_at, updated_at
            FROM analysis_sessions WHERE id = #{id}
            """)
    @ResultType(SessionRows.SessionRow.class)
    SessionRows.SessionRow selectSession(@Param("id") long id);

    @Insert("""
            INSERT INTO sheet_snapshots
              (id, session_id, source_type, source_version, file_name, local_file_path, file_hash,
               downloaded_at, parsed_at, row_count, parse_status, parse_error, profile_json)
            VALUES
              (#{id}, #{sessionId}, 'excel_upload', #{fileName}, #{fileName}, #{localFilePath}, #{fileHash},
               #{downloadedAt}, #{parsedAt}, #{rowCount}, 'parsed', '', #{profileJson})
            """)
    void insertSnapshot(SnapshotRow row);

    @Select("""
            SELECT id, session_id, file_name, local_file_path, file_hash, downloaded_at, parsed_at, row_count, profile_json
            FROM sheet_snapshots WHERE session_id = #{sessionId}
            ORDER BY id DESC LIMIT 1
            """)
    @ResultType(SnapshotRow.class)
    SnapshotRow selectLatestSnapshot(@Param("sessionId") long sessionId);

    @Insert("""
            INSERT INTO ai_table_analyses
              (id, session_id, sheet_snapshot_id, model_name, prompt_version, table_summary, worksheet_name,
               header_row_index, inferred_columns_json, risks_json, raw_output_json, created_at)
            VALUES
              (#{id}, #{sessionId}, #{sheetSnapshotId}, 'rule-based-v1', 'v1', #{tableSummary}, #{worksheetName},
               #{headerRowIndex}, #{inferredColumnsJson}, #{risksJson}, #{rawOutputJson}, #{createdAt})
            """)
    void insertAnalysis(AnalysisRow row);

    @Select("""
            SELECT id, session_id, sheet_snapshot_id, table_summary, worksheet_name, header_row_index,
                   inferred_columns_json, risks_json, raw_output_json, created_at
            FROM ai_table_analyses WHERE session_id = #{sessionId}
            ORDER BY id DESC LIMIT 1
            """)
    @ResultType(AnalysisRow.class)
    AnalysisRow selectLatestAnalysis(@Param("sessionId") long sessionId);

    @Insert("""
            INSERT INTO contact_matches
              (id, session_id, source_row_no, raw_contact_text, employee_id, display_name, department_id, match_status)
            VALUES
              (#{id}, #{sessionId}, #{sourceRowNo}, #{rawContactText}, #{employeeId}, #{displayName}, #{departmentId}, #{matchStatus})
            """)
    void insertContactMatch(@Param("id") long id,
                            @Param("sessionId") long sessionId,
                            @Param("sourceRowNo") Integer sourceRowNo,
                            @Param("rawContactText") String rawContactText,
                            @Param("employeeId") String employeeId,
                            @Param("displayName") String displayName,
                            @Param("departmentId") String departmentId,
                            @Param("matchStatus") String matchStatus);

    @Insert("""
            INSERT INTO followup_items
              (id, session_id, contact_match_id, employee_id, display_name, department_id, email, phone,
               source_rows_json, missing_fields_json, filled_fields_snapshot_json, business_summary,
               issue_summary, status, due_at, created_at, updated_at)
            VALUES
              (#{id}, #{sessionId}, #{contactMatchId}, #{employeeId}, #{displayName}, #{departmentId}, #{email}, #{phone},
               #{sourceRowsJson}, #{missingFieldsJson}, #{filledFieldsSnapshotJson}, #{businessSummary},
               #{issueSummary}, #{status}, #{dueAt}, #{createdAt}, #{updatedAt})
            """)
    void insertItem(ItemRow row);

    @Update("""
            UPDATE followup_items SET
              employee_id = #{employeeId},
              display_name = #{displayName},
              department_id = #{departmentId},
              email = #{email},
              phone = #{phone},
              source_rows_json = #{sourceRowsJson},
              missing_fields_json = #{missingFieldsJson},
              filled_fields_snapshot_json = #{filledFieldsSnapshotJson},
              business_summary = #{businessSummary},
              issue_summary = #{issueSummary},
              status = #{status},
              due_at = #{dueAt},
              updated_at = #{updatedAt}
            WHERE id = #{id}
            """)
    void updateItem(ItemRow row);

    @Select("""
            SELECT id, session_id, contact_match_id, employee_id, display_name, department_id, email, phone,
                   source_rows_json, missing_fields_json, filled_fields_snapshot_json, business_summary,
                   issue_summary, status, due_at, created_at, updated_at
            FROM followup_items WHERE session_id = #{sessionId}
            ORDER BY id
            """)
    @ResultType(ItemRow.class)
    List<ItemRow> selectItems(@Param("sessionId") long sessionId);

    @Select("""
            SELECT id, session_id, contact_match_id, employee_id, display_name, department_id, email, phone,
                   source_rows_json, missing_fields_json, filled_fields_snapshot_json, business_summary,
                   issue_summary, status, due_at, created_at, updated_at
            FROM followup_items WHERE id = #{itemId}
            """)
    @ResultType(ItemRow.class)
    ItemRow selectItem(@Param("itemId") long itemId);

    @Delete("DELETE FROM followup_items WHERE session_id = #{sessionId}")
    void deleteItems(@Param("sessionId") long sessionId);

    @Delete("DELETE FROM followup_items WHERE id = #{itemId}")
    void deleteItemById(@Param("itemId") long itemId);

    @Delete("DELETE FROM followup_tasks WHERE followup_item_id = #{itemId}")
    void deleteTaskByItem(@Param("itemId") long itemId);

    @Delete("DELETE FROM reminder_events WHERE followup_task_id = #{taskId}")
    void deleteEventsByTask(@Param("taskId") long taskId);

    @Delete("DELETE FROM contact_matches WHERE id = #{contactMatchId}")
    void deleteContactMatch(@Param("contactMatchId") long contactMatchId);

    @Delete("DELETE FROM reminder_events WHERE session_id = #{sessionId}")
    void deleteEvents(@Param("sessionId") long sessionId);

    @Delete("DELETE FROM contact_matches WHERE session_id = #{sessionId}")
    void deleteContactMatches(@Param("sessionId") long sessionId);

    @Delete("DELETE FROM ai_table_analyses WHERE session_id = #{sessionId}")
    void deleteAnalyses(@Param("sessionId") long sessionId);

    @Delete("DELETE FROM sheet_snapshots WHERE session_id = #{sessionId}")
    void deleteSnapshots(@Param("sessionId") long sessionId);

    @Delete("DELETE FROM analysis_sessions WHERE id = #{sessionId}")
    void deleteSession(@Param("sessionId") long sessionId);

    @Insert("""
            INSERT INTO followup_tasks
              (id, session_id, followup_item_id, recipient_id, channel, message_draft, message_final,
               status, scheduled_at, sent_at, closed_at)
            VALUES
              (#{id}, #{sessionId}, #{followupItemId}, #{recipientId}, #{channel}, #{messageDraft}, #{messageFinal},
               #{status}, #{scheduledAt}, #{sentAt}, #{closedAt})
            """)
    void insertTask(TaskRow row);

    @Update("""
            UPDATE followup_tasks SET
              recipient_id = #{recipientId},
              channel = #{channel},
              message_draft = #{messageDraft},
              message_final = #{messageFinal},
              status = #{status},
              scheduled_at = #{scheduledAt},
              sent_at = #{sentAt},
              closed_at = #{closedAt}
            WHERE id = #{id}
            """)
    void updateTask(TaskRow row);

    @Select("""
            SELECT id, session_id, followup_item_id, recipient_id, channel, message_draft, message_final,
                   status, scheduled_at, sent_at, closed_at
            FROM followup_tasks WHERE session_id = #{sessionId}
            ORDER BY id
            """)
    @ResultType(TaskRow.class)
    List<TaskRow> selectTasks(@Param("sessionId") long sessionId);

    @Select("""
            SELECT id, session_id, followup_item_id, recipient_id, channel, message_draft, message_final,
                   status, scheduled_at, sent_at, closed_at
            FROM followup_tasks WHERE session_id = #{sessionId} AND followup_item_id = #{itemId}
            ORDER BY id DESC LIMIT 1
            """)
    @ResultType(TaskRow.class)
    TaskRow selectTaskByItem(@Param("sessionId") long sessionId, @Param("itemId") long itemId);

    @Delete("DELETE FROM followup_tasks WHERE session_id = #{sessionId}")
    void deleteTasks(@Param("sessionId") long sessionId);

    @Insert("""
            INSERT INTO reminder_events
              (id, session_id, followup_task_id, channel, recipient_id, message_snapshot, status, sent_at, failed_reason)
            VALUES
              (#{id}, #{sessionId}, #{followupTaskId}, #{channel}, #{recipientId}, #{messageSnapshot}, #{status}, #{sentAt}, #{failedReason})
            """)
    void insertEvent(EventRow row);

    @Select("""
            SELECT id, session_id, followup_task_id, channel, recipient_id, message_snapshot, status, sent_at, failed_reason
            FROM reminder_events WHERE session_id = #{sessionId}
            ORDER BY id DESC
            """)
    @ResultType(EventRow.class)
    List<EventRow> selectEvents(@Param("sessionId") long sessionId);
}
