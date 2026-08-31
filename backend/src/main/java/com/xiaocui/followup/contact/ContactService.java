package com.xiaocui.followup.contact;

import com.xiaocui.followup.addressbook.AddressBookEntry;
import com.xiaocui.followup.addressbook.AddressBookService;
import com.xiaocui.followup.aianalysis.FollowupDraft;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
public class ContactService {
    private final AddressBookService addressBook;

    public ContactService(AddressBookService addressBook) {
        this.addressBook = addressBook;
    }

    /**
     * 判定一个对象能否自动发送：联系方式只认邮箱/手机，工号与部门不参与判断。
     * 表格里没写联系方式时，按负责人姓名回查通讯录补全（姓名归一化后精确匹配，同名取最近更新的一条）。
     */
    public ContactMatch match(FollowupDraft draft) {
        String email = blankToNull(draft.emailHint());
        String phone = blankToNull(draft.phoneHint());

        if (email == null && phone == null && !isBlank(draft.ownerRaw())
                && !"未识别负责人".equals(draft.ownerRaw())) {
            Optional<AddressBookEntry> hit = addressBook.findByName(draft.ownerRaw());
            if (hit.isPresent()) {
                AddressBookEntry entry = hit.get();
                email = blankToNull(entry.email());
                phone = blankToNull(entry.phone());
            }
        }

        boolean matched = !draft.ownerRaw().equals("未识别负责人") && (email != null || phone != null);
        return new ContactMatch(
                draft.ownerRaw(),
                blankToPending(draft.employeeHint()),
                draft.ownerRaw(),
                blankToPending(draft.departmentHint()),
                email == null ? "" : email,
                phone == null ? "" : phone,
                matched ? "matched" : "needs_confirmation"
        );
    }

    private String blankToPending(String value) {
        return isBlank(value) ? "待确认" : value;
    }

    private String blankToNull(String value) {
        return isBlank(value) ? null : value.trim();
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
