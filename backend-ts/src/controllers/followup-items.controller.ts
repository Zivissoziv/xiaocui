import { Body, Controller, Delete, Param, Patch } from '@nestjs/common';
import { UpdateFollowupItemRequest } from '../common/types';
import { FollowupService } from '../providers/followup.service';

/**
 * 待补充事项的更新与删除。
 * 注意：路由必须带 /api 前缀，与 Java 版一致（Java 版类级 @RequestMapping("/api")
 * + 方法级 /followup-items/{itemId}，前端 followupApi.ts 依赖 /api/followup-items 路径）。
 * 历史坑：早期 Express 移植版误把 /api 前缀丢掉，导致前端 PATCH/DELETE 全部 404，
 * 契约快照又按错误路径录制，47 项全绿掩盖了回归。2026-09-02 已修正并回录快照。
 */
@Controller('api/followup-items')
export class FollowupItemsController {
  constructor(private readonly followupService: FollowupService) {}

  @Patch(':itemId')
  updateItem(@Param('itemId') itemId: string, @Body() body: Record<string, any>) {
    return this.followupService.updateItem(Number(itemId), (body ?? {}) as UpdateFollowupItemRequest);
  }

  @Delete(':itemId')
  deleteItem(@Param('itemId') itemId: string) {
    return this.followupService.deleteItem(Number(itemId));
  }
}
