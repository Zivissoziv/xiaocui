package com.xiaocui.followup.support;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * 复杂领域对象与数据库 TEXT 列之间的转换。
 * 一期把画像、分析结果、缺项集合等直接序列化存储，避免为嵌套结构再建一堆子表。
 */
@Component
public class JsonCodec {
    private final ObjectMapper mapper;

    public JsonCodec() {
        this.mapper = new ObjectMapper();
        this.mapper.registerModule(new JavaTimeModule());
        this.mapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        this.mapper.disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
    }

    public String write(Object value) {
        if (value == null) return null;
        try {
            return mapper.writeValueAsString(value);
        } catch (Exception error) {
            throw new IllegalStateException("序列化失败：" + error.getMessage(), error);
        }
    }

    public <T> T read(String json, Class<T> type) {
        return read(json, type, null);
    }

    public <T> T read(String json, Class<T> type, T fallback) {
        if (json == null || json.isBlank()) return fallback;
        try {
            return mapper.readValue(json, type);
        } catch (Exception error) {
            throw new IllegalStateException("反序列化失败：" + error.getMessage(), error);
        }
    }

    public <T> T readRef(String json, TypeReference<T> reference, T fallback) {
        if (json == null || json.isBlank()) return fallback;
        try {
            return mapper.readValue(json, reference);
        } catch (Exception error) {
            throw new IllegalStateException("反序列化失败：" + error.getMessage(), error);
        }
    }

    public List<String> readStrings(String json) {
        return readRef(json, new TypeReference<List<String>>() {
        }, List.of());
    }

    public List<Integer> readIntegers(String json) {
        return readRef(json, new TypeReference<List<Integer>>() {
        }, List.of());
    }

    public Map<String, String> readStringMap(String json) {
        return readRef(json, new TypeReference<Map<String, String>>() {
        }, Map.of());
    }
}
