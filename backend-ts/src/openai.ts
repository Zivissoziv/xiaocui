import { AiSettings } from './types';

/**
 * OpenAI 兼容协议对话客户端（等价 Java 版 AiModelFactory + OpenAiChatModel.call）。
 * 因此 DeepSeek、通义千问、本地 vLLM / Ollama、OpenAI 都能接。
 */
export async function callModel(settings: AiSettings, prompt: string): Promise<string> {
  const url = settings.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
  }
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? '';
}
