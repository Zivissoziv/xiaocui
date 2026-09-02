import { Injectable } from '@nestjs/common';
import { AddressBookEntry, ContactMatch, FollowupDraft } from '../types';
import { AddressBookService } from './address-book.service';

@Injectable()
export class ContactService {
  constructor(private readonly addressBook: AddressBookService) {}

  private findByName(name: string): AddressBookEntry | null {
    return this.addressBook.findByName(name);
  }

  /**
   * 判定一个对象能否自动发送：联系方式只认邮箱/手机，工号与部门不参与判断。
   * 表格里没写联系方式时，按负责人姓名回查通讯录补全（姓名归一化后精确匹配，同名取最近更新的一条）。
   */
  match(draft: FollowupDraft): ContactMatch {
    let email = this.blankToNull(draft.emailHint);
    let phone = this.blankToNull(draft.phoneHint);

    if (email === null && phone === null && !this.isBlank(draft.ownerRaw) && draft.ownerRaw !== '未识别负责人') {
      const hit = this.findByName(draft.ownerRaw);
      if (hit) {
        email = this.blankToNull(hit.email);
        phone = this.blankToNull(hit.phone);
      }
    }

    const matched = draft.ownerRaw !== '未识别负责人' && (email !== null || phone !== null);
    return {
      rawContactText: draft.ownerRaw,
      employeeId: this.blankToPending(draft.employeeHint),
      displayName: draft.ownerRaw,
      departmentId: this.blankToPending(draft.departmentHint),
      email: email === null ? '' : email,
      phone: phone === null ? '' : phone,
      matchStatus: matched ? 'matched' : 'needs_confirmation',
    };
  }

  private blankToPending(value: string | null): string {
    return this.isBlank(value) ? '待确认' : (value as string);
  }

  private blankToNull(value: string | null | undefined): string | null {
    return this.isBlank(value) ? null : (value as string).trim();
  }

  private isBlank(value: string | null | undefined): boolean {
    return value === null || value === undefined || value.trim().length === 0;
  }
}
