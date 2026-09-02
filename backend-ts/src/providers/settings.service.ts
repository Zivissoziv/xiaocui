import { Injectable } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import { AiSettings, AiSettingsView, HttpError } from '../types';
import { DatabaseProvider } from './database.provider';
import { nowStr } from '../util';
import { callModel } from '../openai';

@Injectable()
export class SettingsService {
  private readonly db: DatabaseSync;
  private cache: AiSettings | null = null;

  constructor(dbProvider: DatabaseProvider) {
    this.db = dbProvider.db;
  }

  /**
   * AI 连接参数的读写（等价 Java 版 SettingsService）。
   * apiKey 明文入库，但对外接口只返回掩码，且不写日志。
   */
  private readonly KEY_ENABLED = 'ai.enabled';
  private readonly KEY_BASE_URL = 'ai.base-url';
  private readonly KEY_API_KEY = 'ai.api-key';
  private readonly KEY_MODEL = 'ai.model';

  defaults(): AiSettings {
    return { enabled: false, baseUrl: 'https://api.deepseek.com', apiKey: '', model: 'deepseek-chat' };
  }

  /** 只有开关打开且地址、密钥、模型都填了，才真的走大模型。 */
  isUsable(settings: AiSettings): boolean {
    return (
      settings.enabled &&
      settings.apiKey !== null && settings.apiKey.trim().length > 0 &&
      settings.baseUrl !== null && settings.baseUrl.trim().length > 0 &&
      settings.model !== null && settings.model.trim().length > 0
    );
  }

  loadSettings(): AiSettings {
    if (this.cache) return this.cache;
    const d = this.defaults();
    const loaded: AiSettings = {
      enabled: this.readBool(this.KEY_ENABLED, d.enabled),
      baseUrl: this.read(this.KEY_BASE_URL, d.baseUrl),
      apiKey: this.read(this.KEY_API_KEY, d.apiKey),
      model: this.read(this.KEY_MODEL, d.model),
    };
    this.cache = loaded;
    return loaded;
  }

  /** 保存设置。apiKey 留空表示沿用已保存的值，避免前端不回传时被清空。 */
  save(enabled: boolean, baseUrl: string | null, model: string | null, apiKey: string | null): void {
    const current = this.loadSettings();
    const nextKey = apiKey === null || apiKey.trim().length === 0 ? current.apiKey : apiKey;
    const nextBase = this.isBlank(baseUrl) ? current.baseUrl : (baseUrl as string);
    const nextModel = this.isBlank(model) ? current.model : (model as string);

    this.write(this.KEY_ENABLED, String(enabled));
    this.write(this.KEY_BASE_URL, nextBase);
    this.write(this.KEY_MODEL, nextModel);
    this.write(this.KEY_API_KEY, nextKey);
    this.cache = null;
  }

  view(): AiSettingsView {
    const settings = this.loadSettings();
    return {
      enabled: settings.enabled,
      baseUrl: settings.baseUrl,
      model: settings.model,
      apiKeyMasked: this.mask(settings.apiKey),
      configured: settings.apiKey.trim().length > 0,
    };
  }

  /** 用一条极短的请求验证地址、密钥、模型是否可用。 */
  async testConnection(baseUrl: string | null, model: string | null, apiKey: string | null): Promise<string> {
    const current = this.loadSettings();
    const probe: AiSettings = {
      enabled: true,
      baseUrl: this.isBlank(baseUrl) ? current.baseUrl : (baseUrl as string),
      apiKey: this.isBlank(apiKey) ? current.apiKey : (apiKey as string),
      model: this.isBlank(model) ? current.model : (model as string),
    };
    if (probe.apiKey.trim().length === 0) {
      throw new HttpError('请先填写 API Key');
    }
    try {
      const reply = await callModel(probe, '只回复两个字：正常');
      return reply === null ? '' : reply.trim();
    } catch (error) {
      throw new HttpError(`连接失败：${this.shorten(error instanceof Error ? error.message : String(error))}`);
    }
  }

  private read(key: string, fallback: string): string {
    const row = this.db.prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?').get(key) as
      | { setting_value: string | null }
      | undefined;
    return row && row.setting_value !== null ? row.setting_value : fallback;
  }

  private readBool(key: string, fallback: boolean): boolean {
    const row = this.db.prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?').get(key) as
      | { setting_value: string | null }
      | undefined;
    return row && row.setting_value !== null ? row.setting_value === 'true' : fallback;
  }

  private write(key: string, value: string): void {
    const existing = this.db.prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?').get(key);
    const now = nowStr();
    if (!existing) {
      this.db.prepare('INSERT INTO app_settings(setting_key, setting_value, updated_at) VALUES(?, ?, ?)').run(key, value, now);
    } else {
      this.db.prepare('UPDATE app_settings SET setting_value = ?, updated_at = ? WHERE setting_key = ?').run(value, now, key);
    }
  }

  private mask(apiKey: string): string {
    if (this.isBlank(apiKey)) return '';
    if (apiKey.length <= 8) return '****';
    return apiKey.substring(0, 4) + '****' + apiKey.substring(apiKey.length - 4);
  }

  private isBlank(value: string | null | undefined): boolean {
    return value === null || value === undefined || value.trim().length === 0;
  }

  private shorten(message: string): string {
    return message.length > 200 ? message.substring(0, 200) + '…' : message;
  }
}
