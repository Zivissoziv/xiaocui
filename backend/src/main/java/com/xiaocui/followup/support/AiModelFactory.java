package com.xiaocui.followup.support;

import com.xiaocui.followup.settings.AiSettings;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.stereotype.Component;

/**
 * 按当前设置构建对话模型。
 * 用 OpenAI 兼容协议，因此 DeepSeek、通义千问、本地 vLLM / Ollama、OpenAI 都能接。
 */
@Component
public class AiModelFactory {

    public OpenAiChatModel build(AiSettings settings) {
        OpenAiApi api = OpenAiApi.builder()
                .apiKey(settings.apiKey())
                .baseUrl(settings.baseUrl())
                .build();
        OpenAiChatOptions options = OpenAiChatOptions.builder()
                .model(settings.model())
                .temperature(0.1)
                .build();
        return OpenAiChatModel.builder()
                .openAiApi(api)
                .defaultOptions(options)
                .build();
    }
}
