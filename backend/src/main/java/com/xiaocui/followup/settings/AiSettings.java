package com.xiaocui.followup.settings;

/**
 * AI 连接参数。apiKey 不参与 toString，避免误打进日志。
 */
public record AiSettings(
        boolean enabled,
        String baseUrl,
        String apiKey,
        String model
) {
    public static AiSettings defaults() {
        return new AiSettings(false, "https://api.deepseek.com", "", "deepseek-chat");
    }

    /** 只有开关打开且地址、密钥、模型都填了，才真的走大模型。 */
    public boolean usable() {
        return enabled
                && apiKey != null && !apiKey.isBlank()
                && baseUrl != null && !baseUrl.isBlank()
                && model != null && !model.isBlank();
    }

    public AiSettings withApiKey(String nextApiKey) {
        return new AiSettings(enabled, baseUrl, nextApiKey, model);
    }

    @Override
    public String toString() {
        return "AiSettings{enabled=" + enabled + ", baseUrl=" + baseUrl
                + ", model=" + model + ", apiKey=***}";
    }
}
