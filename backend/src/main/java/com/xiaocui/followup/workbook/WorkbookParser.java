package com.xiaocui.followup.workbook;

import com.xiaocui.followup.config.AppProperties;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class WorkbookParser {
    private final AppProperties properties;
    private final AtomicLong snapshotIds = new AtomicLong(1000);

    public WorkbookParser(AppProperties properties) {
        this.properties = properties;
    }

    public WorkbookSnapshot parse(MultipartFile file) {
        try {
            Path uploadDir = Path.of(properties.uploadDir()).toAbsolutePath().normalize();
            Files.createDirectories(uploadDir);
            String safeName = file.getOriginalFilename() == null ? "uploaded.xlsx" : Path.of(file.getOriginalFilename()).getFileName().toString();
            byte[] bytes = file.getBytes();
            String hash = sha256(bytes);
            Path target = uploadDir.resolve(System.currentTimeMillis() + "-" + safeName).normalize();
            Files.write(target, bytes);

            try (InputStream stream = Files.newInputStream(target); Workbook workbook = WorkbookFactory.create(stream)) {
                List<SheetData> sheets = new ArrayList<>();
                int maxSheets = Math.min(workbook.getNumberOfSheets(), Math.max(1, properties.maxVisibleSheets()));
                for (int i = 0; i < maxSheets; i++) {
                    Sheet sheet = workbook.getSheetAt(i);
                    if (sheet == null || sheet.getPhysicalNumberOfRows() == 0) continue;
                    sheets.add(readSheet(sheet));
                }
                LocalDateTime now = LocalDateTime.now();
                return new WorkbookSnapshot(snapshotIds.incrementAndGet(), safeName, target.toString(), hash, now, now, sheets);
            }
        } catch (Exception error) {
            throw new IllegalArgumentException("Excel 解析失败：" + error.getMessage(), error);
        }
    }

    private SheetData readSheet(Sheet sheet) {
        DataFormatter formatter = new DataFormatter();
        int headerRowIndex = detectHeaderRow(sheet, formatter);
        Row headerRow = sheet.getRow(headerRowIndex);
        List<String> headers = readHeaders(headerRow, formatter);
        List<SheetData.RowData> rows = new ArrayList<>();
        int lastRow = Math.min(sheet.getLastRowNum(), headerRowIndex + Math.max(1, properties.maxRows()));

        for (int rowIndex = headerRowIndex + 1; rowIndex <= lastRow; rowIndex++) {
            Row row = sheet.getRow(rowIndex);
            if (row == null) continue;
            Map<String, String> values = new LinkedHashMap<>();
            boolean hasValue = false;
            for (int columnIndex = 0; columnIndex < headers.size(); columnIndex++) {
                String value = formatter.formatCellValue(row.getCell(columnIndex)).trim();
                if (!value.isEmpty()) hasValue = true;
                values.put(headers.get(columnIndex), value);
            }
            if (hasValue) rows.add(new SheetData.RowData(rowIndex + 1, values));
        }

        return new SheetData(sheet.getSheetName(), headerRowIndex + 1, headers, rows);
    }

    private int detectHeaderRow(Sheet sheet, DataFormatter formatter) {
        int max = Math.min(sheet.getLastRowNum(), 7);
        int bestRow = 0;
        int bestScore = -1;
        for (int i = 0; i <= max; i++) {
            Row row = sheet.getRow(i);
            if (row == null) continue;
            int nonEmpty = 0;
            int keywordHits = 0;
            for (Cell cell : row) {
                String value = formatter.formatCellValue(cell).trim();
                if (value.isEmpty()) continue;
                nonEmpty++;
                if (value.contains("负责人") || value.contains("部门") || value.contains("时间") || value.contains("金额") || value.contains("状态")) {
                    keywordHits += 2;
                }
            }
            int score = nonEmpty + keywordHits;
            if (score > bestScore) {
                bestScore = score;
                bestRow = i;
            }
        }
        return bestRow;
    }

    private List<String> readHeaders(Row headerRow, DataFormatter formatter) {
        List<String> headers = new ArrayList<>();
        int lastCell = Math.max(0, headerRow.getLastCellNum());
        for (int i = 0; i < lastCell; i++) {
            String value = formatter.formatCellValue(headerRow.getCell(i)).trim();
            headers.add(value.isEmpty() ? "未命名列" + (i + 1) : value);
        }
        return headers;
    }

    private String sha256(byte[] bytes) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
        StringBuilder builder = new StringBuilder();
        for (byte item : digest) builder.append(String.format("%02x", item));
        return builder.toString();
    }
}
