import * as fs from 'fs';
import app from './app';
import { config } from './config';
import './db'; // 确保启动时初始化数据库与表结构

fs.mkdirSync(config.uploadDir, { recursive: true });

app.listen(config.port, () => {
  console.log(`ai-followup-backend-ts listening on http://127.0.0.1:${config.port}`);
});
