import { Module } from '@nestjs/common';
import { DatabaseProvider } from './providers/database.provider';
import { RepositoryService } from './providers/repository.service';
import { SettingsService } from './providers/settings.service';
import { AddressBookService } from './providers/address-book.service';
import { ContactService } from './providers/contact.service';
import { AiRoutingService } from './providers/ai-routing.service';
import { FollowupService } from './providers/followup.service';
import { SessionService } from './providers/session.service';
import { AnalysisController } from './controllers/analysis.controller';
import { FollowupItemsController } from './controllers/followup-items.controller';
import { AddressBookController } from './controllers/address-book.controller';
import { SettingsController } from './controllers/settings.controller';

/**
 * 根模块。数据层 → 服务层 → 控制器 单向依赖，无循环。
 * 纯函数模块（workbook/tableProfile/draftBuilder/ruleBased/sender/openai/openAiAnalysis）
 * 保持普通 import，不进 DI 容器。
 */
@Module({
  controllers: [AnalysisController, FollowupItemsController, AddressBookController, SettingsController],
  providers: [
    DatabaseProvider,
    RepositoryService,
    SettingsService,
    AddressBookService,
    ContactService,
    AiRoutingService,
    FollowupService,
    SessionService,
  ],
})
export class AppModule {}
