package com.xiaocui.followup.settings;

import com.xiaocui.followup.support.AiModelFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Service
public class SettingsService {
    private static final String KEY_ENABLED = "ai.enabled";
    private static final String KEY_BASE_URL = "ai.base-url";
    private static final String KEY_API_KEY = "ai.api-key";
    private static final String KEY_MODEL = "ai.model";

    private final SettingsMapper mapper;
    private final AiModelFactory factory;
    private volatile AiSettings cache;

    public SettingsService(SettingsMapper mapper, AiModelFactory factory) {
        this.mapper = mapper;
        this.factory = factory;
    }

    public AiSettings load() {
        AiSettings cached = cache;
        if (cached != null) return cached;

        AiSettings defaults = AiSettings.defaults();
        AiSettings loaded = new AiSettings(
                readBool(KEY_ENABLED, defaults.enabled()),
                read(KEY_BASE_URL, defaults.baseUrl()),
                read(KEY_API_KEY, defaults.apiKey()),
                read(KEY_MODEL, defaults.model())
        );
        cache = loaded;
        return loaded;
    }

    /** 保存设置。apiKey 留空表示沿用已保存的值，避免前端不回传时被清空。 */
    public void save(boolean enabled, String baseUrl, String model, String apiKey) {
        AiSettings current = load();
        String nextKey = apiKey == null || apiKey.isBlank() ? current.apiKey() : apiKey;
        String nextBase = blank(baseUrl) ? current.baseUrl() : baseUrl;
        String nextModel = blank(model) ? current.model() : model;

        write(KEY_ENABLED, String.valueOf(enabled));
        write(KEY_BASE_URL, nextBase);
        write(KEY_MODEL, nextModel);
        write(KEY_API_KEY, nextKey);
        cache = null;
    }

    public AiSettingsView view() {
        AiSettings settings = load();
        return new AiSettingsView(
                settings.enabled(),
                settings.baseUrl(),
                settings.model(),
                mask(settings.apiKey()),
                !settings.apiKey().isBlank()
        );
    }

    /** 用一条极短的请求验证地址、密钥、模型是否可用。 */
    public String testConnection(boolean enabled, String baseUrl, String model, String apiKey) {
        AiSettings current = load();
        AiSettings probe = new AiSettings(
                true,
                blank(baseUrl) ? current.baseUrl() : baseUrl,
                blank(apiKey) ? current.apiKey() : apiKey,
                blank(model) ? current.model() : model
        );
        if (probe.apiKey().isBlank()) {
            throw new IllegalArgumentException("请先填写 API Key");
        }
        try {
            String reply = factory.build(probe).call("只回复两个字：正常");
            return reply == null ? "" : reply.trim();
        } catch (Exception error) {
            throw new IllegalArgumentException("连接失败：" + shorten(error.getMessage()));
        }
    }

    public record AiSettingsView(
            boolean enabled,
            String baseUrl,
            String model,
            String apiKeyMasked,
            boolean configured
    ) {
    }

    private String read(String key, String fallback) {
        String value = mapper.selectValue(key);
        return value == null ? fallback : value;
    }

    private boolean readBool(String key, boolean fallback) {
        String value = mapper.selectValue(key);
        return value == null ? fallback : Boolean.parseBoolean(value);
    }

    private void write(String key, String value) {
        String existing = mapper.selectValue(key);
        LocalDateTime now = LocalDateTime.now();
        if (existing == null) {
            mapper.insert(key, value, now);
        } else {
            mapper.update(key, value, now);
        }
    }

    private String mask(String apiKey) {
        if (apiKey == null || apiKey.isBlank()) return "";
        if (apiKey.length() <= 8) return "****";
        return apiKey.substring(0, 4) + "****" + apiKey.substring(apiKey.length() - 4);
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private String shorten(String message) {
        if (message == null) return "";
        return message.length() > 200 ? message.substring(0, 200) + "…" : message;
    }
}
