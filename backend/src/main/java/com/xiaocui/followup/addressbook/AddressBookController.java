package com.xiaocui.followup.addressbook;

import jakarta.validation.constraints.NotEmpty;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;

@Validated
@RestController
@CrossOrigin(originPatterns = { "http://localhost:*", "http://127.0.0.1:*" })
@RequestMapping("/api/address-book")
public class AddressBookController {
    private final AddressBookService service;

    public AddressBookController(AddressBookService service) {
        this.service = service;
    }

    @GetMapping
    public List<AddressBookEntry> list() {
        return service.list();
    }

    @PostMapping
    public AddressBookEntry create(@RequestBody AddressBookEntry.EditRequest request) {
        return service.create(request);
    }

    @PutMapping("/{id}")
    public AddressBookEntry update(@PathVariable long id, @RequestBody AddressBookEntry.EditRequest request) {
        return service.update(id, request);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable long id) {
        service.delete(id);
    }

    /** 按姓名批量匹配邮箱，供新建催办任务时自动补全。 */
    @PostMapping("/match")
    public List<AddressBookService.MatchedContact> match(@RequestBody MatchRequest request) {
        return service.matchNames(request.names());
    }

    @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public AddressBookService.ImportResult importFile(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "mode", defaultValue = "append") String mode
    ) {
        if (!"append".equalsIgnoreCase(mode) && !"overwrite".equalsIgnoreCase(mode)) {
            throw new IllegalArgumentException("导入模式只支持 append（追加新增）或 overwrite（覆盖更新）");
        }
        return service.importFile(file, mode);
    }

    @GetMapping("/template")
    public ResponseEntity<byte[]> template() {
        return download(service.templateWorkbook(), service.templateFileName());
    }

    @GetMapping("/export")
    public ResponseEntity<byte[]> export() {
        return download(service.exportWorkbook(), service.exportFileName());
    }

    private ResponseEntity<byte[]> download(byte[] content, String fileName) {
        ContentDisposition disposition = ContentDisposition.attachment()
                .name("file")
                .filename(fileName, StandardCharsets.UTF_8)
                .build();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(content);
    }

    public record MatchRequest(@NotEmpty List<String> names) {
    }
}
