package com.xiaocui.followup.contact;

import com.xiaocui.followup.aianalysis.FollowupDraft;
import org.springframework.stereotype.Service;

@Service
public class ContactService {
    public ContactMatch match(FollowupDraft draft) {
        // 联系方式只认邮箱/手机，工号与部门不再参与"能否自动发送"的判断。
        boolean matched = !draft.ownerRaw().equals("未识别负责人")
                && (!isBlank(draft.emailHint()) || !isBlank(draft.phoneHint()));
        return new ContactMatch(
                draft.ownerRaw(),
                blankToPending(draft.employeeHint()),
                draft.ownerRaw(),
                blankToPending(draft.departmentHint()),
                draft.emailHint(),
                draft.phoneHint(),
                matched ? "matched" : "needs_confirmation"
        );
    }

    private String blankToPending(String value) {
        return isBlank(value) ? "待确认" : value;
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
