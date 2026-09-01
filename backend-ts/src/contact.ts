import { AddressBookEntry, ContactMatch, FollowupDraft } from './types';
import { findByName } from './addressBook';

/**
 * 判定一个对象能否自动发送：联系方式只认邮箱/手机，工号与部门不参与判断。
 * 表格里没写联系方式时，按负责人姓名回查通讯录补全（姓名归一化后精确匹配，同名取最近更新的一条）。
 */
export function match(draft: FollowupDraft): ContactMatch {
  let email = blankToNull(draft.emailHint);
  let phone = blankToNull(draft.phoneHint);

  if (email === null && phone === null && !isBlank(draft.ownerRaw) && draft.ownerRaw !== '未识别负责人') {
    const hit = findByName(draft.ownerRaw);
    if (hit) {
      email = blankToNull(hit.email);
      phone = blankToNull(hit.phone);
    }
  }

  const matched = draft.ownerRaw !== '未识别负责人' && (email !== null || phone !== null);
  return {
    rawContactText: draft.ownerRaw,
    employeeId: blankToPending(draft.employeeHint),
    displayName: draft.ownerRaw,
    departmentId: blankToPending(draft.departmentHint),
    email: email === null ? '' : email,
    phone: phone === null ? '' : phone,
    matchStatus: matched ? 'matched' : 'needs_confirmation',
  };
}

function blankToPending(value: string | null): string {
  return isBlank(value) ? '待确认' : (value as string);
}

function blankToNull(value: string | null | undefined): string | null {
  return isBlank(value) ? null : (value as string).trim();
}

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim().length === 0;
}
