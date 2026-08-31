package com.xiaocui.followup.addressbook;

import java.time.LocalDateTime;

/** 通讯录条目：姓名 + 邮箱为核心，部门与手机为可选补充信息。 */
public record AddressBookEntry(
        long id,
        String name,
        String email,
        String department,
        String phone,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public AddressBookEntry withContact(String email, String department, String phone) {
        return new AddressBookEntry(id, name, email, department, phone, createdAt, updatedAt);
    }

    /** 外部传入的编辑内容，null 表示不修改该字段。 */
    public record EditRequest(String name, String email, String department, String phone) {
    }
}
