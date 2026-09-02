import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { SettingsService } from '../providers/settings.service';

/** AI 设置路由（等价原 Express 版 SettingsController 的路由块）。 */
@Controller('api/settings/ai')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  view() {
    return this.settings.view();
  }

  @Put()
  save(@Body() body: Record<string, any>) {
    const b = body ?? {};
    this.settings.save(b.enabled === true, b.baseUrl ?? null, b.model ?? null, b.apiKey ?? null);
    return this.settings.view();
  }

  @Post('test')
  @HttpCode(200)
  async test(@Body() body: Record<string, any>) {
    const b = body ?? {};
    const reply = await this.settings.testConnection(b.baseUrl ?? null, b.model ?? null, b.apiKey ?? null);
    return { ok: true, reply };
  }
}
