package com.xiaocui.followup.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record AppProperties(
        String uploadDir,
        int maxVisibleSheets,
        int maxRows,
        Sender sender
) {
    public record Sender(String mode) {
    }
}
