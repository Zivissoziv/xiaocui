import express, { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import * as sessionService from './sessionService';
import * as followupService from './followupService';
import * as repository from './repository';
import * as addressBook from './addressBook';
import * as settings from './settings';
import { HttpError, SendRequest, UpdateFollowupItemRequest } from './types';
import { isBlank } from './util';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 与 Java 版 spring.servlet.multipart.max-file-size=10MB 一致
});

const app = express();

// 与 Java 版 @CrossOrigin 一致：只放行本机来源
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin || '';
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

app.use(express.json({ limit: '12mb' }));

const wrap = (handler: (req: Request, res: Response) => Promise<unknown> | unknown) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res);
    } catch (error) {
      next(error);
    }
  };

// ---------- 催办会话（等价 FollowupController） ----------

app.get('/api/analysis-sessions', wrap(async (_req, res) => {
  res.json(sessionService.list());
}));

app.get('/api/analysis-sessions/details', wrap(async (_req, res) => {
  res.json(sessionService.list().map((session) => followupService.detail(session.id)));
}));

app.post('/api/analysis-sessions', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw new HttpError('请上传 Excel 文件');
  const instruction = req.body['instruction'];
  if (isBlank(instruction)) throw new HttpError('instruction 不能为空');
  res.json(await sessionService.createAndAnalyze(
    { buffer: req.file.buffer, originalname: req.file.originalname },
    req.body['title'] ?? null,
    instruction,
    req.body['dueAt'] ?? null
  ));
}));

app.get('/api/analysis-sessions/:sessionId', wrap(async (req, res) => {
  res.json(sessionService.detail(Number(req.params.sessionId)));
}));

app.patch('/api/analysis-sessions/:sessionId', wrap(async (req, res) => {
  res.json(sessionService.updateMeta(Number(req.params.sessionId), req.body ?? {}));
}));

app.post('/api/analysis-sessions/:sessionId/messages/regenerate', wrap(async (req, res) => {
  res.json(await followupService.regenerateMessages(Number(req.params.sessionId)));
}));

app.delete('/api/analysis-sessions/:sessionId', wrap(async (req, res) => {
  const sessionId = Number(req.params.sessionId);
  repository.requireSession(sessionId);
  repository.deleteSession(sessionId);
  res.status(200).end();
}));

app.get('/api/analysis-sessions/:sessionId/analysis', wrap(async (req, res) => {
  res.json(repository.getAnalysis(Number(req.params.sessionId)));
}));

app.get('/api/analysis-sessions/:sessionId/followup-items', wrap(async (req, res) => {
  res.json(repository.getItems(Number(req.params.sessionId)));
}));

app.patch('/followup-items/:itemId', wrap(async (req, res) => {
  res.json(followupService.updateItem(Number(req.params.itemId), (req.body ?? {}) as UpdateFollowupItemRequest));
}));

app.delete('/followup-items/:itemId', wrap(async (req, res) => {
  res.json(followupService.deleteItem(Number(req.params.itemId)));
}));

app.post('/api/analysis-sessions/:sessionId/followup-tasks/send', wrap(async (req, res) => {
  res.json(followupService.sendAll(Number(req.params.sessionId), (req.body ?? null) as SendRequest | null));
}));

app.post('/api/analysis-sessions/:sessionId/refresh', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw new HttpError('请上传 Excel 文件');
  res.json(await sessionService.refresh(
    Number(req.params.sessionId),
    { buffer: req.file.buffer, originalname: req.file.originalname }
  ));
}));

app.post('/api/analysis-sessions/:sessionId/refresh-preview', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw new HttpError('请上传 Excel 文件');
  res.json(await sessionService.previewRefresh(
    Number(req.params.sessionId),
    { buffer: req.file.buffer, originalname: req.file.originalname }
  ));
}));

app.post('/api/analysis-sessions/:sessionId/refresh/confirm', wrap(async (req, res) => {
  res.json(await sessionService.confirmRefresh(Number(req.params.sessionId)));
}));

app.get('/api/analysis-sessions/:sessionId/reminder-events', wrap(async (req, res) => {
  res.json(repository.getEvents(Number(req.params.sessionId)));
}));

// ---------- 通讯录（等价 AddressBookController） ----------

app.get('/api/address-book', wrap(async (_req, res) => {
  res.json(addressBook.list());
}));

app.post('/api/address-book', wrap(async (req, res) => {
  res.json(addressBook.create(req.body ?? {}));
}));

app.put('/api/address-book/:id', wrap(async (req, res) => {
  res.json(addressBook.update(Number(req.params.id), req.body ?? {}));
}));

app.delete('/api/address-book/:id', wrap(async (req, res) => {
  addressBook.remove(Number(req.params.id));
  res.status(200).end();
}));

app.post('/api/address-book/match', wrap(async (req, res) => {
  res.json(addressBook.matchNames((req.body ?? {}).names ?? null));
}));

app.post('/api/address-book/import', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw new HttpError('请先选择要导入的 Excel 文件');
  const mode = (req.body['mode'] as string) || 'append';
  if (mode.toLowerCase() !== 'append' && mode.toLowerCase() !== 'overwrite') {
    throw new HttpError('导入模式只支持 append（追加新增）或 overwrite（覆盖更新）');
  }
  res.json(addressBook.importFile(req.file.buffer, mode));
}));

app.get('/api/address-book/template', wrap(async (_req, res) => {
  download(res, addressBook.templateWorkbook(), addressBook.templateFileName());
}));

app.get('/api/address-book/export', wrap(async (_req, res) => {
  download(res, addressBook.exportWorkbook(), addressBook.exportFileName());
}));

function download(res: Response, content: Buffer, fileName: string): void {
  const encoded = Buffer.from(fileName, 'utf8')
    .toString('binary')
    .replace(/[^\x20-\x7e]/g, (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
  res.setHeader('Content-Disposition', `attachment; filename="file"; filename*=UTF-8''${encoded}`);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.status(200).send(content);
}

// ---------- AI 设置（等价 SettingsController） ----------

app.get('/api/settings/ai', wrap(async (_req, res) => {
  res.json(settings.view());
}));

app.put('/api/settings/ai', wrap(async (req, res) => {
  const body = req.body ?? {};
  settings.save(body.enabled === true, body.baseUrl ?? null, body.model ?? null, body.apiKey ?? null);
  res.json(settings.view());
}));

app.post('/api/settings/ai/test', wrap(async (req, res) => {
  const body = req.body ?? {};
  const reply = await settings.testConnection(body.baseUrl ?? null, body.model ?? null, body.apiKey ?? null);
  res.json({ ok: true, reply });
}));

// ---------- 异常处理（等价 ApiExceptionHandler：业务异常 → 400 + { message }） ----------

app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: 'Not Found' });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof HttpError) {
    res.status(400).json({ message: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error('未处理异常：', error instanceof Error ? error.stack : error);
  res.status(500).json({ message });
});

export default app;
