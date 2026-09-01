import { AiSettings, AiSettingsView, HttpError } from './types';
import { db } from './db';
import { nowStr } from './util';
import { callModel } from './openai';

/**
 * AI 连接参数的读写（等价 Java 版 SettingsService）。
 * apiKey 明文入库，但对外接口只返回掩码，且不写日志。
 */
const KEY_ENABLED = 'ai.enabled';
const KEY_BASE_URL = 'ai.base-url';
const KEY_API_KEY = 'ai.api-key';
const KEY_MODEL = 'ai.model';

let cache: AiSettings | null = null;

export function defaults(): AiSettings {
  return { enabled: false, baseUrl: 'https://api.deepseek.com', apiKey: '', model: 'deepseek-chat' };
}

/** 只有开关打开且地址、密钥、模型都填了，才真的走大模型。 */
export function isUsable(settings: AiSettings): boolean {
  return (
    settings.enabled &&
    settings.apiKey !== null && settings.apiKey.trim().length > 0 &&
    settings.baseUrl !== null && settings.baseUrl.trim().length > 0 &&
    settings.model !== null && settings.model.trim().length > 0
  );
}

export function loadSettings(): AiSettings {
  if (cache) return cache;
  const d = defaults();
  const loaded: AiSettings = {
    enabled: readBool(KEY_ENABLED, d.enabled),
    baseUrl: read(KEY_BASE_URL, d.baseUrl),
    apiKey: read(KEY_API_KEY, d.apiKey),
    model: read(KEY_MODEL, d.model),
  };
  cache = loaded;
  return loaded;
}

/** 保存设置。apiKey 留空表示沿用已保存的值，避免前端不回传时被清空。 */
export function save(enabled: boolean, baseUrl: string | null, model: string | null, apiKey: string | null): void {
  const current = loadSettings();
  const nextKey = apiKey === null || apiKey.trim().length === 0 ? current.apiKey : apiKey;
  const nextBase = isBlank(baseUrl) ? current.baseUrl : (baseUrl as string);
  const nextModel = isBlank(model) ? current.model : (model as string);

  write(KEY_ENABLED, String(enabled));
  write(KEY_BASE_URL, nextBase);
  write(KEY_MODEL, nextModel);
  write(KEY_API_KEY, nextKey);
  cache = null;
}

export function view(): AiSettingsView {
  const settings = loadSettings();
  return {
    enabled: settings.enabled,
    baseUrl: settings.baseUrl,
    model: settings.model,
    apiKeyMasked: mask(settings.apiKey),
    configured: settings.apiKey.trim().length > 0,
  };
}

/** 用一条极短的请求验证地址、密钥、模型是否可用。 */
export async function testConnection(baseUrl: string | null, model: string | null, apiKey: string | null): Promise<string> {
  const current = loadSettings();
  const probe: AiSettings = {
    enabled: true,
    baseUrl: isBlank(baseUrl) ? current.baseUrl : (baseUrl as string),
    apiKey: isBlank(apiKey) ? current.apiKey : (apiKey as string),
    model: isBlank(model) ? current.model : (model as string),
  };
  if (probe.apiKey.trim().length === 0) {
    throw new HttpError('请先填写 API Key');
  }
  try {
    const reply = await callModel(probe, '只回复两个字：正常');
    return reply === null ? '' : reply.trim();
  } catch (error) {
    throw new HttpError(`连接失败：${shorten(error instanceof Error ? error.message : String(error))}`);
  }
}

function read(key: string, fallback: string): string {
  const row = db.prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?').get(key) as
    | { setting_value: string | null }
    | undefined;
  return row && row.setting_value !== null ? row.setting_value : fallback;
}

function readBool(key: string, fallback: boolean): boolean {
  const row = db.prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?').get(key) as
    | { setting_value: string | null }
    | undefined;
  return row && row.setting_value !== null ? row.setting_value === 'true' : fallback;
}

function write(key: string, value: string): void {
  const existing = db.prepare('SELECT setting_value FROM app_settings WHERE setting_key = ?').get(key);
  const now = nowStr();
  if (!existing) {
    db.prepare('INSERT INTO app_settings(setting_key, setting_value, updated_at) VALUES(?, ?, ?)').run(key, value, now);
  } else {
    db.prepare('UPDATE app_settings SET setting_value = ?, updated_at = ? WHERE setting_key = ?').run(value, now, key);
  }
}

function mask(apiKey: string): string {
  if (isBlank(apiKey)) return '';
  if (apiKey.length <= 8) return '****';
  return apiKey.substring(0, 4) + '****' + apiKey.substring(apiKey.length - 4);
}

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim().length === 0;
}

function shorten(message: string): string {
  return message.length > 200 ? message.substring(0, 200) + '…' : message;
}
