import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { HttpError, SendRequest, UpdateFollowupItemRequest } from '../types';
import { fixFileName, isBlank } from '../util';
import { SessionService } from '../providers/session.service';
import { FollowupService } from '../providers/followup.service';
import { RepositoryService } from '../providers/repository.service';

/** 与 Java 版 spring.servlet.multipart.max-file-size=10MB 一致。 */
const FILE_LIMIT = 10 * 1024 * 1024;

/** 催办会话路由（等价原 Express 版 FollowupController 的路由块）。 */
@Controller('api/analysis-sessions')
export class AnalysisController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly followupService: FollowupService,
    private readonly repository: RepositoryService
  ) {}

  @Get()
  list() {
    return this.sessionService.list();
  }

  @Get('details')
  details() {
    return this.sessionService.list().map((session) => this.followupService.detail(session.id));
  }

  @Post()
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: FILE_LIMIT } }))
  async create(@UploadedFile() file: Express.Multer.File, @Body() body: Record<string, any>) {
    if (!file) throw new HttpError('请上传 Excel 文件');
    const instruction = body['instruction'];
    if (isBlank(instruction)) throw new HttpError('instruction 不能为空');
    return this.sessionService.createAndAnalyze(
      { buffer: file.buffer, originalname: fixFileName(file.originalname) },
      body['title'] ?? null,
      instruction,
      body['dueAt'] ?? null
    );
  }

  @Get(':sessionId')
  detail(@Param('sessionId') sessionId: string) {
    return this.sessionService.detail(Number(sessionId));
  }

  @Patch(':sessionId')
  updateMeta(@Param('sessionId') sessionId: string, @Body() body: Record<string, any>) {
    return this.sessionService.updateMeta(Number(sessionId), body ?? {});
  }

  @Post(':sessionId/messages/regenerate')
  @HttpCode(200)
  async regenerateMessages(@Param('sessionId') sessionId: string) {
    return this.followupService.regenerateMessages(Number(sessionId));
  }

  @Delete(':sessionId')
  deleteSession(@Param('sessionId') sessionId: string): void {
    const id = Number(sessionId);
    this.repository.requireSession(id);
    this.repository.deleteSession(id);
  }

  @Get(':sessionId/analysis')
  getAnalysis(@Param('sessionId') sessionId: string) {
    return this.repository.getAnalysis(Number(sessionId));
  }

  @Get(':sessionId/followup-items')
  getItems(@Param('sessionId') sessionId: string) {
    return this.repository.getItems(Number(sessionId));
  }

  @Post(':sessionId/followup-tasks/send')
  @HttpCode(200)
  sendAll(@Param('sessionId') sessionId: string, @Body() body: Record<string, any>) {
    return this.followupService.sendAll(Number(sessionId), (body ?? null) as SendRequest | null);
  }

  @Post(':sessionId/refresh')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: FILE_LIMIT } }))
  async refresh(@Param('sessionId') sessionId: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new HttpError('请上传 Excel 文件');
    return this.sessionService.refresh(Number(sessionId), {
      buffer: file.buffer,
      originalname: fixFileName(file.originalname),
    });
  }

  @Post(':sessionId/refresh-preview')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: FILE_LIMIT } }))
  async previewRefresh(@Param('sessionId') sessionId: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new HttpError('请上传 Excel 文件');
    return this.sessionService.previewRefresh(Number(sessionId), {
      buffer: file.buffer,
      originalname: fixFileName(file.originalname),
    });
  }

  @Post(':sessionId/refresh/confirm')
  @HttpCode(200)
  async confirmRefresh(@Param('sessionId') sessionId: string) {
    return this.sessionService.confirmRefresh(Number(sessionId));
  }

  @Get(':sessionId/reminder-events')
  getEvents(@Param('sessionId') sessionId: string) {
    return this.repository.getEvents(Number(sessionId));
  }
}
