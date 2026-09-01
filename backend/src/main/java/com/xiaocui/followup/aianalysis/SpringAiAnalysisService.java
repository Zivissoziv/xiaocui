package com.xiaocui.followup.aianalysis;

import com.fasterxml.jackson.core.type.TypeReference;
import com.xiaocui.followup.settings.SettingsService;
import com.xiaocui.followup.support.AiModelFactory;
import com.xiaocui.followup.support.JsonCodec;
import com.xiaocui.followup.tableprofile.ColumnProfile;
import com.xiaocui.followup.tableprofile.WorkbookProfile;
import com.xiaocui.followup.workbook.SheetData;
import com.xiaocui.followup.workbook.WorkbookSnapshot;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 真实大模型实现。
 * 遵守设计文档的分层：程序读表 -> 模型只看结构摘要判列 -> 程序判定缺项 -> 模型生成文案。
 * 任何一步失败都返回 null或部分结果，由 RoutingAiAnalysisService 决定降级，不把异常抛给用户。
 */
@Service
public class SpringAiAnalysisService implements AiAnalysisService {
    private final SettingsService settingsService;
    private final AiModelFactory factory;
    private final DraftBuilder draftBuilder;
    private final JsonCodec codec;
    private final RuleBasedAiAnalysisService ruleBased;

    public SpringAiAnalysisService(SettingsService settingsService,
                                   AiModelFactory factory,
                                   DraftBuilder draftBuilder,
                                   JsonCodec codec,
                                   RuleBasedAiAnalysisService ruleBased) {
        this.settingsService = settingsService;
        this.factory = factory;
        this.draftBuilder = draftBuilder;
        this.codec = codec;
        this.ruleBased = ruleBased;
    }

    @Override
    public AiAnalysisResult analyze(WorkbookSnapshot snapshot, WorkbookProfile profile, String instruction, String dueAt) {
        SheetData sheet = snapshot.sheets().stream()
                .max(Comparator.comparingInt(item -> item.rows().size()))
                .orElseThrow(() -> new IllegalArgumentException("没有可分析的 Sheet"));
        WorkbookProfile.SheetProfile sheetProfile = profile.sheets().stream()
                .filter(item -> item.sheetName().equals(sheet.sheetName()))
                .findFirst()
                .orElseThrow();

        List<String> risks = new ArrayList<>();
        OpenAiChatModel model = factory.build(settingsService.load());

        ColumnPlan plan = inferColumns(model, sheet, sheetProfile, instruction, risks);
        if (plan == null) {
            plan = ruleBased.inferColumnPlan(sheet, sheetProfile, instruction);
            risks.add("模型未能识别列结构，已回退到关键词规则。");
        }

        List<FollowupDraft> drafts = draftBuilder.build(sheet, plan, dueAt, risks);
        if (!drafts.isEmpty()) {
            generateMessages(model, drafts, instruction, dueAt, risks);
        }

        String tableSummary = describeTable(model, sheet, sheetProfile, instruction, plan);
        return new AiAnalysisResult(tableSummary, plan, drafts, risks);
    }

    /** 第一步：只把结构摘要给模型，让它判断哪一列是负责人、哪些列是要催的字段。 */
    private ColumnPlan inferColumns(OpenAiChatModel model, SheetData sheet,
                                    WorkbookProfile.SheetProfile profile, String instruction, List<String> risks) {
        StringBuilder columns = new StringBuilder();
        for (ColumnProfile column : profile.columnProfiles()) {
            columns.append("- ")
                    .append(column.column())
                    .append(" | 类型 ").append(column.typeGuess())
                    .append(" | 非空率 ").append(column.nonEmptyRate())
                    .append(" | 样例 ").append(String.join("、", column.sampleValues()))
                    .append('\n');
        }
        String prompt = """
                你是表格结构分析助手。下面是一个工作表的结构摘要，请判断各列用途。

                用户的催办要求：%s

                工作表名：%s，共 %d 行数据。
                列信息（列名 | 类型 | 非空率 | 样例）：
                %s
                请只输出一个 JSON 对象，不要任何解释文字、不要代码块标记，格式如下：
                {
                  "tableSummary": "一句话说明这张表在收集什么",
                  "ownerColumn": "负责人列的列名，没有就空字符串",
                  "emailColumn": "邮箱列列名，没有就空字符串",
                  "phoneColumn": "手机或电话列列名，没有就空字符串",
                  "businessKeyColumns": ["用于定位业务对象的列，例如项目名称、合同编号，最多 3 个"],
                  "requiredColumns": ["用户这次要求必须填写、但目前存在空值的列"]
                }
                严格要求：只能使用上面真实出现过的列名，禁止编造；requiredColumns 要贴合用户的催办要求。
                """.formatted(instruction == null ? "" : instruction, sheet.sheetName(), sheet.rows().size(), columns);

        try {
            ColumnPlanReply reply = codec.read(extractJson(model.call(prompt)), ColumnPlanReply.class);
            if (reply == null) return null;
            Set<String> headers = new LinkedHashSet<>(sheet.headers());
            return new ColumnPlan(
                    sheet.sheetName(),
                    pick(reply.ownerColumn(), headers),
                    pick(reply.departmentColumn(), headers),
                    pick(reply.employeeColumn(), headers),
                    pick(reply.emailColumn(), headers),
                    pick(reply.phoneColumn(), headers),
                    pickAll(reply.businessKeyColumns(), headers, 3),
                    pickAll(reply.requiredColumns(), headers, 8)
            );
        } catch (Exception error) {
            risks.add("模型列识别异常：" + shorten(error.getMessage()));
            return null;
        }
    }

    /**
     * 对外：只重生成催办文案（不动列识别与缺项判定）。
     * 用户在详情页点「重生成文案」、或模板改版后刷新历史任务时走这里。
     *
     * @return 是否至少生成了一条文案；false 表示应由调用方回退到模板文案。
     */
    @Override
    public boolean regenerateMessages(List<FollowupDraft> drafts, String instruction, String dueAt, List<String> risks) {
        if (drafts == null || drafts.isEmpty()) return false;
        try {
            OpenAiChatModel model = factory.build(settingsService.load());
            generateMessages(model, drafts, instruction, dueAt, risks);
        } catch (Exception error) {
            risks.add("模型不可用，已使用模板文案：" + shorten(error.getMessage()));
            return false;
        }
        return drafts.stream().anyMatch(draft -> draft.messageDraft() != null && !draft.messageDraft().isBlank());
    }

    /** 第二步：把程序判定出的缺项交给模型，生成更自然的催办文案。 */
    private void generateMessages(OpenAiChatModel model, List<FollowupDraft> drafts,
                                  String instruction, String dueAt, List<String> risks) {
        StringBuilder items = new StringBuilder();
        for (int index = 0; index < drafts.size(); index++) {
            FollowupDraft draft = drafts.get(index);
            items.append(index + 1)
                    .append(". 负责人：").append(draft.ownerRaw())
                    .append(" | 业务：").append(draft.businessSummary())
                    .append(" | 缺失：").append(String.join("、", draft.missingFields()))
                    .append(" | 来源行：").append(draft.sourceRows())
                    .append('\n');
        }
        String prompt = """
                你是企业内部的催办助手。请为下面每位负责人写一条催办消息。

                催办要求：%s
                截止日期：%s

                待催办对象：
                %s
                请只输出一个 JSON 对象，不要解释文字、不要代码块标记，格式如下：
                {"messages":[{"owner":"负责人姓名","message":"催办消息正文"}]}
                要求：每条正文不超过 80 字；写清楚缺哪几个字段和截止时间；语气礼貌但明确；
                不要加入你推测出来但实际没有的信息；负责人姓名必须与输入完全一致；
                不要把「催办要求」原文搬进正文（例如不要出现“本次要求：……”这类字样），
                它只是给你判断范围的背景，收件人只需要知道自己缺什么、什么时候前补。
                """.formatted(instruction == null ? "" : instruction,
                dueAt == null || dueAt.isBlank() ? "未指定，写“尽快”" : dueAt, items);

        try {
            MessageReply reply = codec.read(extractJson(model.call(prompt)), MessageReply.class);
            if (reply == null || reply.messages() == null || reply.messages().isEmpty()) {
                risks.add("模型未返回催办文案，已使用模板文案。");
                return;
            }
            Map<String, String> byOwner = new java.util.LinkedHashMap<>();
            for (MessageEntry entry : reply.messages()) {
                if (entry != null && entry.owner() != null && entry.message() != null && !entry.message().isBlank()) {
                    byOwner.putIfAbsent(entry.owner().trim(), entry.message().trim());
                }
            }
            if (byOwner.isEmpty()) {
                risks.add("模型返回的催办文案无法匹配，已使用模板文案。");
                return;
            }
            for (int index = 0; index < drafts.size(); index++) {
                FollowupDraft draft = drafts.get(index);
                String message = byOwner.get(draft.ownerRaw());
                if (message == null || message.isBlank()) continue;
                drafts.set(index, draft.withMessage(message));
            }
        } catch (Exception error) {
            risks.add("模型文案生成异常，已使用模板文案：" + shorten(error.getMessage()));
        }
    }

    private String describeTable(OpenAiChatModel model, SheetData sheet, WorkbookProfile.SheetProfile profile,
                                 String instruction, ColumnPlan plan) {
        return "%s 共读取 %d 行，识别 %s 为负责人列，%s 为待补充字段。（%s 识别）".formatted(
                sheet.sheetName(),
                profile.rowCount(),
                plan.ownerColumn().isBlank() ? "待确认" : plan.ownerColumn(),
                plan.requiredColumns().isEmpty() ? "待确认字段" : String.join("、", plan.requiredColumns()),
                settingsService.load().model()
        );
    }

    public record ColumnPlanReply(String tableSummary,
                                   String ownerColumn,
                                   String departmentColumn,
                                   String employeeColumn,
                                   String emailColumn,
                                   String phoneColumn,
                                   List<String> businessKeyColumns,
                                   List<String> requiredColumns) {
    }

    public record MessageReply(List<MessageEntry> messages) {
    }

    public record MessageEntry(String owner, String message) {
    }

    /** 模型经常用 ```json 包裹输出，这里把真正的 JSON 抠出来。 */
    private String extractJson(String raw) {
        if (raw == null || raw.isBlank()) return "";
        String text = raw.trim();
        if (text.startsWith("```")) {
            int firstBrace = text.indexOf('{');
            int lastBrace = text.lastIndexOf('}');
            if (firstBrace >= 0 && lastBrace > firstBrace) {
                return text.substring(firstBrace, lastBrace + 1);
            }
        }
        int firstBrace = text.indexOf('{');
        int lastBrace = text.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            return text.substring(firstBrace, lastBrace + 1);
        }
        return text;
    }

    private String pick(String value, Set<String> headers) {
        if (value == null || value.isBlank()) return "";
        String trimmed = value.trim();
        return headers.contains(trimmed) ? trimmed : "";
    }

    private List<String> pickAll(List<String> values, Set<String> headers, int limit) {
        List<String> result = new ArrayList<>();
        if (values == null) return result;
        for (String value : values) {
            String matched = pick(value, headers);
            if (!matched.isBlank() && !result.contains(matched)) result.add(matched);
            if (result.size() >= limit) break;
        }
        return result;
    }

    private String shorten(String message) {
        if (message == null) return "";
        return message.length() > 120 ? message.substring(0, 120) + "…" : message;
    }
}
