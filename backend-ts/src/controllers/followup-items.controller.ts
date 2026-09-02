import { Body, Controller, Delete, Param, Patch } from '@nestjs/common';
import { UpdateFollowupItemRequest } from '../types';
import { FollowupService } from '../providers/followup.service';

/**
 * 待补充事项的更新与删除。
 * 注意：这两条路由**没有 /api 前缀**（与原 Express 版 / Java 版保持一致，前端依赖此路径）。
 */
@Controller('followup-items')
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
