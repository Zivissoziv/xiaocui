import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { HttpError } from '../common/types';
import { AddressBookService } from '../providers/address-book.service';

/** 与 Java 版 spring.servlet.multipart.max-file-size=10MB 一致。 */
const FILE_LIMIT = 10 * 1024 * 1024;

/** 通讯录路由（等价原 Express 版 AddressBookController 的路由块）。 */
@Controller('api/address-book')
export class AddressBookController {
  constructor(private readonly addressBook: AddressBookService) {}

  @Get()
  list() {
    return this.addressBook.list();
  }

  @Post()
  @HttpCode(200)
  create(@Body() body: Record<string, any>) {
    return this.addressBook.create(body ?? {});
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: Record<string, any>) {
    return this.addressBook.update(Number(id), body ?? {});
  }

  @Delete(':id')
  @HttpCode(200)
  remove(@Param('id') id: string): void {
    this.addressBook.remove(Number(id));
  }

  @Post('match')
  @HttpCode(200)
  match(@Body() body: Record<string, any>) {
    return this.addressBook.matchNames((body ?? {}).names ?? null);
  }

  @Post('import')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: FILE_LIMIT } }))
  importFile(@UploadedFile() file: Express.Multer.File, @Body() body: Record<string, any>) {
    if (!file) throw new HttpError('请先选择要导入的 Excel 文件');
    const mode = String(body['mode'] || 'append');
    if (mode.toLowerCase() !== 'append' && mode.toLowerCase() !== 'overwrite') {
      throw new HttpError('导入模式只支持 append（追加新增）或 overwrite（覆盖更新）');
    }
    return this.addressBook.importFile(file.buffer, mode);
  }

  @Get('template')
  template(@Res() res: Response): void {
    download(res, this.addressBook.templateWorkbook(), this.addressBook.templateFileName());
  }

  @Get('export')
  export(@Res() res: Response): void {
    download(res, this.addressBook.exportWorkbook(), this.addressBook.exportFileName());
  }
}

/** 与原 Express 版 download() 逐字节一致：UTF-8 文件名按二进制编码进 filename*。 */
function download(res: Response, content: Buffer, fileName: string): void {
  const encoded = Buffer.from(fileName, 'utf8')
    .toString('binary')
    .replace(/[^\x20-\x7e]/g, (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
  res.setHeader('Content-Disposition', `attachment; filename="file"; filename*=UTF-8''${encoded}`);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.status(200).send(content);
}
