package com.xiaocui.followup.aianalysis;

import com.xiaocui.followup.settings.SettingsService;
import com.xiaocui.followup.tableprofile.WorkbookProfile;
import com.xiaocui.followup.workbook.WorkbookSnapshot;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * 按设置决定走大模型还是关键词规则。
 * 模型不可用、报错、返回异常结构时自动降级，保证没配 Key 或 Key 失效时功能照常。
 */
@Primary
@Service
public class RoutingAiAnalysisService implements AiAnalysisService {
    private static final Logger log = LoggerFactory.getLogger(RoutingAiAnalysisService.class);

    private final SettingsService settingsService;
    private final SpringAiAnalysisService aiService;
    private final RuleBasedAiAnalysisService ruleService;

    public RoutingAiAnalysisService(SettingsService settingsService,
                                    SpringAiAnalysisService aiService,
                                    RuleBasedAiAnalysisService ruleService) {
        this.settingsService = settingsService;
        this.aiService = aiService;
        this.ruleService = ruleService;
    }

    @Override
    public AiAnalysisResult analyze(WorkbookSnapshot snapshot, WorkbookProfile profile, String instruction, String dueAt) {
        if (!settingsService.load().usable()) {
            return ruleService.analyze(snapshot, profile, instruction, dueAt);
        }
        try {
            AiAnalysisResult result = aiService.analyze(snapshot, profile, instruction, dueAt);
            if (result != null && result.columnPlan() != null) {
                return result;
            }
            log.warn("AI 分析结果为空，回退到规则实现");
        } catch (Exception error) {
            // 异常信息里可能带密钥片段，只记类型和简短消息
            log.warn("AI 分析失败，回退到规则实现：{}", error.getClass().getSimpleName());
        }

        AiAnalysisResult fallback = ruleService.analyze(snapshot, profile, instruction, dueAt);
        List<String> risks = new ArrayList<>();
        risks.add("本次未使用大模型，结果来自关键词规则。请在「设置」中检查 API Key 与网络。");
        risks.addAll(fallback.risks());
        return new AiAnalysisResult(fallback.tableSummary(), fallback.columnPlan(), fallback.followupItems(), risks);
    }
}
