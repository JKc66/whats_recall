import type {
  Chat,
  Message,
  MonitoredChat,
  Stats,
  WhatsAppChat,
  AppSettings,
  PairingStatus,
} from "./types";

import { BASE_URL } from "./utils";

const fp = () => localStorage.getItem("fingerprint") || "";

async function request<T>(url: string, init?: RequestInit, silent?: false): Promise<T>;
async function request<T>(url: string, init: RequestInit | undefined, silent: true): Promise<T | null>;
async function request<T>(url: string, init?: RequestInit, silent = false): Promise<T | null> {
  const fingerprint = fp();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string>),
  };
  
  if (fingerprint) headers["X-Fingerprint"] = fingerprint;

  try {
    const res = await fetch(url, { 
      ...init, 
      headers,
      credentials: "include"
    });

    if (res.status === 401) {
      if (!window.location.pathname.endsWith("/login")) {
        localStorage.removeItem("fingerprint");
        window.location.href = BASE_URL + "/";
      }
      if (silent) return null;
      throw new Error("Unauthorized");
    }

    if (!res.ok) {
      if (silent) return null;
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || data.message || `Request failed with status ${res.status}`);
    }

    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  } catch (err) {
    if (silent) return null;
    throw err;
  }
}

export async function login(
  password: string,
  fingerprint: string,
): Promise<{ success: boolean; token?: string }> {
  return request(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({ password, fingerprint }),
  });
}

export async function fetchUptime(): Promise<{ uptime: number }> {
  return request<{ uptime: number }>(`${BASE_URL}/api/auth/uptime`);
}

export async function verifyAuth(): Promise<boolean> {
  try {
    const data = await request<{ authenticated: boolean }>(
      `${BASE_URL}/api/auth/verify`,
    );
    return !!data?.authenticated;
  } catch {
    return false;
  }
}

export async function logout(): Promise<void> {
  await fetch(`${BASE_URL}/api/auth/logout`, { method: "POST" });
  localStorage.removeItem("fingerprint");
}

export async function fetchStats(silent = false): Promise<Stats | null> {
  return request<Stats>(`${BASE_URL}/api/status`, undefined, silent as any);
}

export async function fetchChats(q?: string, silent = false): Promise<Chat[] | null> {
  const url = q ? `${BASE_URL}/api/chats?q=${encodeURIComponent(q)}` : `${BASE_URL}/api/chats`;
  const data = await request<{ chats: Chat[] }>(url, undefined, silent as any);
  if (data?.chats) return data.chats;
  return silent ? null : [];
}

export async function markChatAsRead(chatId: string): Promise<void> {
  await request(`${BASE_URL}/api/chats/${encodeURIComponent(chatId)}/read`, {
    method: "POST",
  });
}

export async function fetchMessages(
  chatId: string,
  limit = 200,
  silent = false
): Promise<Message[] | null> {
  const data = await request<{ messages: Message[] }>(
    `${BASE_URL}/api/chats/${encodeURIComponent(chatId)}/messages?limit=${limit}`,
    undefined,
    silent as any
  );
  if (data?.messages) return data.messages;
  return silent ? null : [];
}

export async function fetchMonitored(): Promise<MonitoredChat[]> {
  const data = await request<{ monitored: MonitoredChat[] }>(
    `${BASE_URL}/api/monitored`,
  );
  return data.monitored;
}

export async function addMonitored(
  chatId: string,
  name: string,
  isGroup: boolean,
): Promise<void> {
  await request(`${BASE_URL}/api/monitored`, {
    method: "POST",
    body: JSON.stringify({ chatId, name, isGroup }),
  });
}

export async function removeMonitored(chatId: string): Promise<void> {
  await request(`${BASE_URL}/api/monitored/${encodeURIComponent(chatId)}`, {
    method: "DELETE",
  });
}

export async function fetchWhatsAppChats(refresh = false): Promise<WhatsAppChat[]> {
  const url = refresh ? `${BASE_URL}/api/whatsapp/chats?refresh=true` : `${BASE_URL}/api/whatsapp/chats`;
  const data = await request<{ chats: WhatsAppChat[] }>(url);
  return data.chats;
}

export async function fetchSettings(): Promise<AppSettings> {
  return request<AppSettings>(`${BASE_URL}/api/settings`);
}

export async function updateSetting(key: string, value: string): Promise<void> {
  await request(`${BASE_URL}/api/settings/update`, {
    method: "POST",
    body: JSON.stringify({ key, value }),
  });
}

export async function clearData(password: string): Promise<void> {
  await request(`${BASE_URL}/api/data`, {
    method: "DELETE",
    body: JSON.stringify({ password }),
  });
}

export async function fetchPairingStatus(): Promise<PairingStatus> {
  return request<PairingStatus>(`${BASE_URL}/api/whatsapp/pairing`);
}

export async function resetWhatsApp(requestPairing = true): Promise<void> {
  await request(`${BASE_URL}/api/whatsapp/reset`, {
    method: "POST",
    body: JSON.stringify({ requestPairing }),
  });
}

export function createWs(onEvent: (_event: string, _data: any) => void): {
  close: () => void;
} {
  let stopped = false;
  let ws: WebSocket | null = null;
  let reconnectDelay = 1000;
  let pingCheckTimer: ReturnType<typeof setInterval> | null = null;
  let lastPong = Date.now();

  const MAX_RECONNECT_DELAY = 15_000;
  const PING_TIMEOUT = 40_000;

  function connect() {
    if (stopped) return;

    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${proto}//${location.host}${BASE_URL}/ws`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("[WS] Connected");
      reconnectDelay = 1000;
      lastPong = Date.now();

      pingCheckTimer = setInterval(() => {
        if (Date.now() - lastPong > PING_TIMEOUT) {
          console.log("[WS] No ping from server, reconnecting...");
          ws?.close();
        }
      }, PING_TIMEOUT);
    };

    ws.onmessage = (e) => {
      try {
        const { event, data } = JSON.parse(e.data);
        if (event === "ping") {
          lastPong = Date.now();
          ws?.send(JSON.stringify({ event: "pong", data }));
          return;
        }
        onEvent(event, data);
      } catch {
        /* ignore */
      }
    };

    ws.onclose = (e) => {
      console.log(`[WS] Closed (code: ${e.code})`);
      if (pingCheckTimer) {
        clearInterval(pingCheckTimer);
        pingCheckTimer = null;
      }
      if (!stopped) {
        setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_RECONNECT_DELAY);
      }
    };

    ws.onerror = () => {
      console.log("[WS] Error");
    };
  }

  connect();

  return {
    close: () => {
      stopped = true;
      if (pingCheckTimer) {
        clearInterval(pingCheckTimer);
        pingCheckTimer = null;
      }
      ws?.close();
    },
  };
}
