import type { Chat, Message, MonitoredChat, Stats, WhatsAppChat } from './types';

const fp = () => localStorage.getItem('fingerprint') || '';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  const fingerprint = fp();
  if (fingerprint) headers['X-Fingerprint'] = fingerprint;

  const res = await fetch(url, { ...init, headers });

  if (res.status === 401) {
    window.location.href = '/#login';
    throw new Error('Unauthorized');
  }
  return res.json() as Promise<T>;
}

export async function login(password: string, fingerprint: string) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, fingerprint }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  localStorage.setItem('fingerprint', fingerprint);
  return data;
}

export async function verifyAuth(): Promise<boolean> {
  try {
    const data = await request<{ authenticated: boolean }>('/api/auth/verify');
    return data.authenticated;
  } catch {
    return false;
  }
}

export async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  localStorage.removeItem('fingerprint');
}

export async function fetchStats(): Promise<Stats> {
  return request('/api/status');
}

export async function fetchChats(): Promise<Chat[]> {
  const data = await request<{ chats: Chat[] }>('/api/chats');
  return data.chats;
}

export async function fetchMessages(chatId: string, limit = 200): Promise<Message[]> {
  const data = await request<{ messages: Message[] }>(
    `/api/chats/${encodeURIComponent(chatId)}/messages?limit=${limit}`
  );
  return data.messages;
}

export async function fetchMonitored(): Promise<MonitoredChat[]> {
  const data = await request<{ monitored: MonitoredChat[] }>('/api/monitored');
  return data.monitored;
}

export async function addMonitored(chatId: string, name: string, isGroup: boolean) {
  return request('/api/monitored', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, name, isGroup }),
  });
}

export async function removeMonitored(chatId: string) {
  return request(`/api/monitored/${encodeURIComponent(chatId)}`, {
    method: 'DELETE',
  });
}

export async function fetchWhatsAppChats(): Promise<WhatsAppChat[]> {
  const data = await request<{ chats: WhatsAppChat[] }>('/api/whatsapp/chats');
  return data.chats;
}

export function createWs(onEvent: (event: string, data: unknown) => void): { close: () => void } {
  let stopped = false;

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws`);

    ws.onmessage = (e) => {
      try {
        const { event, data } = JSON.parse(e.data);
        onEvent(event, data);
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      if (!stopped) setTimeout(connect, 3000);
    };
  }

  connect();
  return { close: () => { stopped = true; } };
}
