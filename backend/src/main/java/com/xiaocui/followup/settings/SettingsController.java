package com.xiaocui.followup.settings;

import jakarta.validation.constraints.NotBlank;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequestMapping("/api/settings")
public class SettingsController {
    private final SettingsService service;

    public SettingsController(SettingsService service) {
        this.service = service;
    }

    @GetMapping("/ai")
    public SettingsService.AiSettingsView getAiSettings() {
        return service.view();
    }

    @PutMapping("/ai")
    public SettingsService.AiSettingsView saveAiSettings(@RequestBody AiSettingsRequest request) {
        service.save(
                request.enabled() != null && request.enabled(),
                request.baseUrl(),
                request.model(),
                request.apiKey()
        );
        return service.view();
    }

    @PostMapping("/ai/test")
    public TestResult testAiSettings(@RequestBody AiSettingsRequest request) {
        String reply = service.testConnection(true, request.baseUrl(), request.model(), request.apiKey());
        return new TestResult(true, reply);
    }

    public record AiSettingsRequest(Boolean enabled, String baseUrl, String model, String apiKey) {
    }

    public record TestResult(boolean ok, String reply) {
    }
}
