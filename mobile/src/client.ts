import * as SecureStore from 'expo-secure-store';
import { File } from 'expo-file-system';
import type { Language, MobileAction, Workspace } from './types';
import { createActionTransport } from './action-transport';

const CONNECTION_KEY = 'morrowfolio.mobile.connection.v1';
export const LANGUAGE_KEY = 'morrowfolio.mobile.language.v1';

export interface Connection {
  baseUrl: string;
  token: string;
  expiresAt: string;
}

export class MobileApiError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message); }
}

export function validateBaseUrl(value: string, language: Language = 'en-US') {
  const invalid = () => new Error(language === 'zh-CN' ? '请输入已配置且手机可达的私人 HTTPS 后端地址，不能使用电脑上的 localhost 地址。' : 'Use your computer’s configured private HTTPS backend URL. The iPhone cannot use the computer’s localhost address.');
  let url;
  try { url = new URL(value.trim()); } catch { throw invalid(); }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  const development = __DEV__ || process.env.EXPO_PUBLIC_ALLOW_LOCAL_HTTP === '1';
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (url.protocol !== 'https:' && !(development && local && url.protocol === 'http:'))) {
    throw invalid();
  }
  return url.origin;
}

function requestId() {
  return `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export class MobileClient {
  private submit = createActionTransport(body => this.request('/api/mobile/action', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, language: this.language }),
  }), requestId);

  constructor(public connection: Connection, public language: Language) {}

  static async restore(language: Language) {
    const stored = await SecureStore.getItemAsync(CONNECTION_KEY);
    if (!stored) return null;
    try {
      const connection = JSON.parse(stored) as Connection;
      validateBaseUrl(connection.baseUrl, language);
      const expiry = Date.parse(connection.expiresAt);
      if (!/^[A-Za-z0-9_-]{43}$/.test(connection.token) || !Number.isFinite(expiry) || expiry <= Date.now()) return null;
      return new MobileClient(connection, language);
    } catch { return null; }
  }

  static async pair(baseUrl: string, code: string, language: Language) {
    const base = validateBaseUrl(baseUrl, language);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`${base}/api/mobile/pair`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ code: code.trim(), language }),
      });
      const body = await response.json();
      if (!response.ok) throw new MobileApiError(body.messages?.[language] ?? body.error ?? 'Pairing failed.', response.status, body.code ?? 'pairing-failed');
      const connection = { baseUrl: base, token: body.token, expiresAt: body.expiresAt } as Connection;
      const expiry = Date.parse(connection.expiresAt);
      if (!/^[A-Za-z0-9_-]{43}$/.test(connection.token) || !Number.isFinite(expiry) || expiry <= Date.now()) throw new Error(language === 'zh-CN' ? '服务器返回的手机会话无效，请重新配对。' : 'The server returned an invalid mobile session.');
      await SecureStore.setItemAsync(CONNECTION_KEY, JSON.stringify(connection));
      return new MobileClient(connection, language);
    } catch (error) {
      if (controller.signal.aborted) throw new MobileApiError(language === 'zh-CN' ? '配对连接超时，请检查手机能否访问这个 HTTPS 地址。' : 'Pairing timed out. Check that the iPhone can reach this HTTPS URL.', 0, 'pairing-timeout');
      throw error;
    } finally { clearTimeout(timer); }
  }

  async disconnect() {
    try { await this.request('/api/mobile/disconnect', { method: 'POST' }); } catch { /* Local revocation still clears the stored token. */ }
    await SecureStore.deleteItemAsync(CONNECTION_KEY);
  }

  private async request(path: string, options: RequestInit = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), path.includes('/voice/') ? 60_000 : 100_000);
    try {
      const response = await fetch(`${this.connection.baseUrl}${path}`, {
        ...options, signal: controller.signal,
        headers: { Authorization: `Bearer ${this.connection.token}`, ...options.headers },
      });
      const data = await response.json();
      if (!response.ok) throw new MobileApiError(data.messages?.[this.language] ?? data.error ?? `HTTP ${response.status}`, response.status, data.code ?? 'request-failed');
      return data;
    } catch (error) {
      if (controller.signal.aborted) throw new MobileApiError(this.language === 'zh-CN' ? '连接超时。重试会沿用同一操作编号。' : 'The connection timed out. Retry will reuse the same operation ID.', 0, 'request-timeout');
      throw error;
    } finally { clearTimeout(timer); }
  }

  async state(): Promise<Workspace> {
    return this.request(`/api/mobile/state?language=${encodeURIComponent(this.language)}`);
  }

  async action(body: MobileAction): Promise<Workspace> {
    return this.submit(body);
  }

  async transcribe(uri: string, mimeType: string): Promise<string> {
    const file = new File(uri);
    if (file.size > 4_000_000) throw new Error(this.language === 'zh-CN' ? '录音过大，请控制在30秒内。' : 'Keep your recording below 30 seconds.');
    const result = await this.request('/api/mobile/voice/transcribe', {
      method: 'POST', headers: { 'Content-Type': mimeType, 'X-Voice-Language': this.language },
      body: await file.arrayBuffer(),
    });
    return result.text;
  }
}
