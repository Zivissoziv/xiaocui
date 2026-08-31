package com.xiaocui.followup.addressbook;

import com.xiaocui.followup.session.SessionRepository;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/** 通讯录：维护人员姓名与邮箱，支持 Excel 模板导入（追加/覆盖）、导出与手动增删改。 */
@Service
public class AddressBookService {
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private static final String[] HEADERS = { "姓名", "邮箱", "部门", "手机" };
    private static final DateTimeFormatter FILE_STAMP = DateTimeFormatter.ofPattern("yyyyMMdd");

    private final AddressBookMapper mapper;
    private final SessionRepository repository;

    public AddressBookService(AddressBookMapper mapper, SessionRepository repository) {
        this.mapper = mapper;
        this.repository = repository;
    }

    public List<AddressBookEntry> list() {
        List<AddressBookEntry> entries = new ArrayList<>();
        for (AddressBookRows.ContactRow row : mapper.selectAll()) {
            entries.add(toEntry(row));
        }
        return entries;
    }

    @Transactional
    public AddressBookEntry create(AddressBookEntry.EditRequest request) {
        String name = requireName(request.name());
        String email = requireEmail(request.email());
        LocalDateTime now = LocalDateTime.now();
        long id = repository.nextId();
        mapper.insert(id, name, email, blank(request.department()), blank(request.phone()), now);
        return toEntry(mapper.selectById(id));
    }

    @Transactional
    public AddressBookEntry update(long id, AddressBookEntry.EditRequest request) {
        AddressBookEntry current = find(id);
        String name = request.name() == null || request.name().isBlank()
                ? current.name()
                : requireName(request.name());
        String email = request.email() == null || request.email().isBlank()
                ? current.email()
                : requireEmail(request.email());
        String department = request.department() == null ? current.department() : blank(request.department());
        String phone = request.phone() == null ? current.phone() : blank(request.phone());
        mapper.updateContact(id, email, department, phone, LocalDateTime.now());
        if (!name.equals(current.name())) {
            mapper.rename(id, name, LocalDateTime.now());
        }
        return toEntry(mapper.selectById(id));
    }

    @Transactional
    public void delete(long id) {
        find(id);
        mapper.delete(id);
    }

    public AddressBookEntry find(long id) {
        AddressBookRows.ContactRow row = mapper.selectById(id);
        if (row == null) throw new IllegalArgumentException("通讯录条目不存在");
        return toEntry(row);
    }

    /** 按姓名查通讯录，供催办任务生成时自动补全邮箱。 */
    public Optional<AddressBookEntry> findByName(String name) {
        if (isBlank(name)) return Optional.empty();
        AddressBookRows.ContactRow row = mapper.selectByName(normalize(name));
        return row == null ? Optional.empty() : Optional.of(toEntry(row));
    }

    /** 批量匹配：返回每个姓名对应的通讯录邮箱，未命中的也返回（matched=false），便于前端提示。 */
    public List<MatchedContact> matchNames(List<String> names) {
        List<MatchedContact> result = new ArrayList<>();
        if (names == null) return result;
        for (String name : names) {
            if (isBlank(name)) continue;
            String key = normalize(name);
            if (result.stream().anyMatch(item -> item.name().equals(key))) continue;
            Optional<AddressBookEntry> hit = findByName(key);
            result.add(hit
                    .map(entry -> new MatchedContact(key, entry.email(), entry.department(), entry.phone(), true))
                    .orElseGet(() -> new MatchedContact(key, "", "", "", false)));
        }
        return result;
    }

    /**
     * 导入 Excel。mode=append：只新增通讯录里没有的姓名，已存在的跳过；
     * mode=overwrite：文件中出现的姓名覆盖已有记录，不在此文件中的记录保留。
     */
    @Transactional
    public ImportResult importFile(MultipartFile file, String mode) {
        if (file == null || file.isEmpty()) throw new IllegalArgumentException("请先选择要导入的 Excel 文件");
        boolean overwrite = "overwrite".equalsIgnoreCase(mode);

        List<ParsedRow> rows = parse(file);
        List<String> errors = new ArrayList<>();
        int added = 0;
        int updated = 0;
        int skipped = 0;

        for (ParsedRow row : rows) {
            if (row.error() != null) {
                errors.add(row.error());
                continue;
            }
            AddressBookRows.ContactRow existing = mapper.selectByName(row.name());
            if (existing == null) {
                mapper.insert(repository.nextId(), row.name(), row.email(), row.department(), row.phone(), LocalDateTime.now());
                added++;
            } else if (overwrite) {
                mapper.updateContact(existing.id, row.email(), row.department(), row.phone(), LocalDateTime.now());
                updated++;
            } else {
                skipped++;
            }
        }
        if (added == 0 && updated == 0 && errors.isEmpty()) {
            throw new IllegalArgumentException("没有导入任何数据：通讯录中已存在这些姓名（可改用「覆盖更新」模式）");
        }
        return new ImportResult(rows.size(), added, updated, skipped, errors);
    }

    /** 导出为可再次导入的 Excel（只包含姓名/邮箱/部门/手机四列）。 */
    public byte[] exportWorkbook() {
        try (XSSFWorkbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("通讯录");
            writeHeader(workbook, sheet);
            int rowIndex = 1;
            for (AddressBookEntry entry : list()) {
                Row row = sheet.createRow(rowIndex++);
                row.createCell(0).setCellValue(entry.name());
                row.createCell(1).setCellValue(entry.email());
                row.createCell(2).setCellValue(entry.department() == null ? "" : entry.department());
                row.createCell(3).setCellValue(entry.phone() == null ? "" : entry.phone());
            }
            for (int i = 0; i < HEADERS.length; i++) sheet.autoSizeColumn(i);
            workbook.write(out);
            return out.toByteArray();
        } catch (IOException error) {
            throw new IllegalStateException("导出失败：" + error.getMessage());
        }
    }

    /** 导入模板：表头 + 两行示例。 */
    public byte[] templateWorkbook() {
        try (XSSFWorkbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("通讯录");
            writeHeader(workbook, sheet);
            String[][] samples = {
                    { "张三", "zhangsan@example.com", "市场部", "13800000001" },
                    { "李四", "lisi@example.com", "采购部", "" },
            };
            for (int i = 0; i < samples.length; i++) {
                Row row = sheet.createRow(i + 1);
                for (int column = 0; column < samples[i].length; column++) {
                    row.createCell(column).setCellValue(samples[i][column]);
                }
            }
            for (int i = 0; i < HEADERS.length; i++) sheet.autoSizeColumn(i);
            workbook.write(out);
            return out.toByteArray();
        } catch (IOException error) {
            throw new IllegalStateException("模板生成失败：" + error.getMessage());
        }
    }

    public String exportFileName() {
        return "通讯录-" + LocalDateNow() + ".xlsx";
    }

    public String templateFileName() {
        return "通讯录导入模板.xlsx";
    }

    private static String LocalDateNow() {
        return LocalDateTime.now().format(FILE_STAMP);
    }

    private void writeHeader(XSSFWorkbook workbook, Sheet sheet) {
        var style = workbook.createCellStyle();
        var font = workbook.createFont();
        font.setBold(true);
        style.setFont(font);
        Row header = sheet.createRow(0);
        for (int i = 0; i < HEADERS.length; i++) {
            Cell cell = header.createCell(i);
            cell.setCellValue(HEADERS[i]);
            cell.setCellStyle(style);
        }
    }

    private List<ParsedRow> parse(MultipartFile file) {
        try (InputStream stream = file.getInputStream(); Workbook workbook = WorkbookFactory.create(stream)) {
            if (workbook.getNumberOfSheets() == 0) throw new IllegalArgumentException("文件里没有工作表");
            Sheet sheet = workbook.getSheetAt(0);
            Map<Integer, Integer> columnMap = readHeader(sheet);
            DataFormatter formatter = new DataFormatter();
            List<ParsedRow> rows = new ArrayList<>();

            int start = columnMap.isEmpty() ? 0 : 1;
            for (int i = start; i <= sheet.getLastRowNum(); i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;
                String name = cell(row, columnMap, 0, formatter);
                String email = cell(row, columnMap, 1, formatter);
                String department = cell(row, columnMap, 2, formatter);
                String phone = cell(row, columnMap, 3, formatter);
                if (isBlank(name) && isBlank(email)) continue;

                int rowNo = i + 1;
                if (isBlank(name)) {
                    rows.add(new ParsedRow("", "", "", "", "第 " + rowNo + " 行：姓名为空"));
                    continue;
                }
                if (isBlank(email)) {
                    rows.add(new ParsedRow("", "", "", "", "第 " + rowNo + " 行（" + name + "）：邮箱为空"));
                    continue;
                }
                if (!EMAIL.matcher(email).matches()) {
                    rows.add(new ParsedRow("", "", "", "", "第 " + rowNo + " 行（" + name + "）：邮箱格式不正确"));
                    continue;
                }
                rows.add(new ParsedRow(normalize(name), email.trim(), blank(department), blank(phone), null));
            }
            if (rows.isEmpty()) throw new IllegalArgumentException("没有解析到任何数据行，请检查文件内容");
            return rows;
        } catch (IllegalArgumentException error) {
            throw error;
        } catch (Exception error) {
            throw new IllegalArgumentException("无法解析该文件，请确认是 .xlsx / .xls 格式的通讯录表");
        }
    }

    /** 识别表头所在列；识别不出（没有「姓名」「邮箱」表头）时按 A/B/C/D 列顺序读取。 */
    private Map<Integer, Integer> readHeader(Sheet sheet) {
        Map<Integer, Integer> map = new LinkedHashMap<>();
        Row header = sheet.getRow(0);
        if (header == null) return map;
        DataFormatter formatter = new DataFormatter();
        Map<String, Integer> aliases = new LinkedHashMap<>();
        aliases.put("姓名", 0);
        aliases.put("名字", 0);
        aliases.put("负责人", 0);
        aliases.put("人员", 0);
        aliases.put("邮箱", 1);
        aliases.put("邮件", 1);
        aliases.put("电子邮件", 1);
        aliases.put("email", 1);
        aliases.put("e-mail", 1);
        aliases.put("部门", 2);
        aliases.put("手机", 3);
        aliases.put("手机号", 3);
        aliases.put("电话", 3);
        aliases.put("联系电话", 3);

        for (int i = header.getFirstCellNum(); i < header.getLastCellNum(); i++) {
            Cell cell = header.getCell(i);
            if (cell == null) continue;
            String text = formatter.formatCellValue(cell).trim().toLowerCase();
            Integer target = aliases.get(text);
            if (target != null) map.putIfAbsent(target, i);
        }
        // 至少要认出姓名和邮箱两列，否则退回按列顺序读取
        return map.containsKey(0) && map.containsKey(1) ? map : Map.of();
    }

    private String cell(Row row, Map<Integer, Integer> columnMap, int target, DataFormatter formatter) {
        int index = columnMap.getOrDefault(target, target);
        Cell cell = row.getCell(index);
        return cell == null ? "" : formatter.formatCellValue(cell).trim();
    }

    private String requireName(String name) {
        if (isBlank(name)) throw new IllegalArgumentException("姓名不能为空");
        return normalize(name);
    }

    private String requireEmail(String email) {
        if (isBlank(email)) throw new IllegalArgumentException("邮箱不能为空");
        String trimmed = email.trim();
        if (!EMAIL.matcher(trimmed).matches()) throw new IllegalArgumentException("邮箱格式不正确：" + trimmed);
        return trimmed;
    }

    /** 姓名归一化：去首尾与内部空白，便于「张 三」与「张三」互相匹配。 */
    private String normalize(String name) {
        return name == null ? "" : name.replaceAll("\\s+", "").trim();
    }

    private String blank(String value) {
        return value == null ? "" : value.trim();
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private AddressBookEntry toEntry(AddressBookRows.ContactRow row) {
        return new AddressBookEntry(row.id, row.name, row.email, row.department, row.phone, row.createdAt, row.updatedAt);
    }

    private record ParsedRow(String name, String email, String department, String phone, String error) {
    }

    public record ImportResult(int total, int added, int updated, int skipped, List<String> errors) {
    }

    public record MatchedContact(String name, String email, String department, String phone, boolean matched) {
    }
}
