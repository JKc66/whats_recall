import type { Chat, Message, MonitoredChat, Stats, WhatsAppChat } from './types';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const fp = () => localStorage.getItem('fingerprint') || '';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  const fingerprint = fp();
  if (fingerprint) headers['X-Fingerprint'] = fingerprint;

  const res = await fetch(url, { ...init, headers });

  if (res.status === 401) {
    window.location.href = BASE + '/';
    throw new Error('Unauthorized');
  }
  return res.json() as Promise<T>;
}

export async function login(password: string, fingerprint: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, fingerprint }),
  });

  let data: Record<string, unknown>;
  try {
    const text = await res.text();
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('Server returned an invalid response');
  }

  if (!res.ok) throw new Error((data.error as string) || 'Login failed');
  localStorage.setItem('fingerprint', fingerprint);
  return data;
}

export async function verifyAuth(): Promise<boolean> {
  try {
    const data = await request<{ authenticated: boolean }>(`${BASE}/api/auth/verify`);
    return data.authenticated;
  } catch {
    return false;
  }
}

export async function logout() {
  await fetch(`${BASE}/api/auth/logout`, { method: 'POST' });
  localStorage.removeItem('fingerprint');
}

export async function fetchStats(): Promise<Stats> {
  return request(`${BASE}/api/status`);
}

export async function fetchChats(): Promise<Chat[]> {
  const data = await request<{ chats: Chat[] }>(`${BASE}/api/chats`);
  return data.chats;
}

export async function fetchMessages(chatId: string, limit = 200): Promise<Message[]> {
  const data = await request<{ messages: Message[] }>(
    `${BASE}/api/chats/${encodeURIComponent(chatId)}/messages?limit=${limit}`
  );
  return data.messages;
}

export async function fetchMonitored(): Promise<MonitoredChat[]> {
  const data = await request<{ monitored: MonitoredChat[] }>(`${BASE}/api/monitored`);
  return data.monitored;
}

export async function addMonitored(chatId: string, name: string, isGroup: boolean) {
  return request(`${BASE}/api/monitored`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, name, isGroup }),
  });
}

export async function removeMonitored(chatId: string) {
  return request(`${BASE}/api/monitored/${encodeURIComponent(chatId)}`, {
    method: 'DELETE',
  });
}

export async function fetchWhatsAppChats(): Promise<WhatsAppChat[]> {
  const data = await request<{ chats: WhatsAppChat[] }>(`${BASE}/api/whatsapp/chats`);
  return data.chats;
}

export async function setNotifyEnabled(enabled: boolean): Promise<void> {
  await request(`${BASE}/api/settings/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
}

export function createWs(onEvent: (event: string, data: unknown) => void): { close: () => void } {
  let stopped = false;

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${location.host}${BASE}/ws`;
    console.log(`[WS] Connecting to ${wsUrl}`);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[WS] Connected');
    };

    ws.onmessage = (e) => {
      try {
        const { event, data } = JSON.parse(e.data);
        onEvent(event, data);
      } catch { /* ignore */ }
    };

    ws.onerror = (e) => {
      console.error('[WS] Error:', e);
    };

    ws.onclose = (e) => {
      console.log(`[WS] Closed (code: ${e.code})`);
      if (!stopped) setTimeout(connect, 3000);
    };
  }

  connect();
  return { close: () => { stopped = true; } };
}
