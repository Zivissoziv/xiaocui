package com.xiaocui.followup.addressbook;

import java.time.LocalDateTime;

/** 数据库行对象。MyBatis 直接读写这里的字段，与 SessionRows 保持一致的写法。 */
public final class AddressBookRows {
    private AddressBookRows() {
    }

    public static class ContactRow {
        public long id;
        public String name;
        public String email;
        public String department;
        public String phone;
        public LocalDateTime createdAt;
        public LocalDateTime updatedAt;
    }
}
