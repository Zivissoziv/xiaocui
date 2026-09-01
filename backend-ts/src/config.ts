/** 应用配置，等价于 Java 版 application.yml 中的 app.* 配置。 */
export const config = {
  port: Number(process.env.PORT || 8080),
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  dataDir: process.env.DATA_DIR || './data',
  maxVisibleSheets: 8,
  maxRows: 5000,
};
