import 'reflect-metadata';
import express from 'express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { config } from './config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false, // 关闭内置 bodyParser，手动挂载与 Java 版一致的 12mb 限制
  });

  app.use(express.json({ limit: '12mb' }));

  // 与 Java 版 @CrossOrigin 一致：只放行本机来源
  app.enableCors({
    origin: /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  });

  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(config.port);
  // eslint-disable-next-line no-console
  console.log(`listening on ${config.port}`);
}

bootstrap().catch((error) => {
  console.error('启动失败：', error);
  process.exit(1);
});
