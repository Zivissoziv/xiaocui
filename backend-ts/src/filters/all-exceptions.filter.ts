import { ArgumentsHost, Catch, ExceptionFilter, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { HttpError } from '../types';

/**
 * 全局异常处理（等价原 Express 版 ApiExceptionHandler / 404 中间件）：
 *   - 业务异常 HttpError        → 400 + { message }
 *   - 未知路由                  → 404 + { message: 'Not Found' }（与原版 body 完全一致）
 *   - 其他异常                  → 500 + { message }（并打印堆栈）
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpError) {
      res.status(400).json({ message: exception.message });
      return;
    }

    if (exception instanceof NotFoundException) {
      res.status(404).json({ message: 'Not Found' });
      return;
    }

    const message = exception instanceof Error ? exception.message : String(exception);
    console.error('未处理异常：', exception instanceof Error ? exception.stack : exception);
    res.status(500).json({ message });
  }
}
